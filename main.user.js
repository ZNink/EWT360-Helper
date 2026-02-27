// ==UserScript==
// @name         升学E网通助手 v2 Lite
// @namespace    https://github.com/ZNink/EWT360-Helper
// @version      2.4.1
// @description  用于帮助学生通过升学E网通更好学习知识(雾)
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @match        http://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @match        https://web.ewt360.com/site-study/*
// @match        http://web.ewt360.com/site-study/*
// @author       ZNink，Linrzh，L#peace
// @icon         https://www.ewt360.com/favicon.ico
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ZNink/EWT360-Helper/main/main.user.js
// @downloadURL  https://raw.githubusercontent.com/ZNink/EWT360-Helper/main/main.user.js
// @supportURL   https://github.com/ZNink/EWT360-Helper/issues
// ==/UserScript==

/**
 * 调试日志工具模块
 */
const DebugLogger = {
    enabled: false,

    getTimestamp() {
        const now = new Date();
        return `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}]`;
    },

    log(module, message, data = null) {
        if (!this.enabled) return;
        const logMsg = `${this.getTimestamp()} [${module}] [INFO] ${message}`;
        data ? console.log(logMsg, data) : console.log(logMsg);
    },

    warn(module, message, data = null) {
        if (!this.enabled) return;
        const logMsg = `${this.getTimestamp()} [${module}] [WARN] ${message}`;
        data ? console.warn(logMsg, data) : console.warn(logMsg);
    },

    error(module, message, error = null) {
        if (!this.enabled) return;
        const logMsg = `${this.getTimestamp()} [${module}] [ERROR] ${message}`;
        error ? console.error(logMsg, error) : console.error(logMsg);
    },

    debug(module, message, data = null) {
        if (!this.enabled) return;
        const logMsg = `${this.getTimestamp()} [${module}] [DEBUG] ${message}`;
        data ? console.debug(logMsg, data) : console.debug(logMsg);
    },
};

/**
 * 配置常量
 */
const Config = {
    skipQuestionInterval: 1000,
    rewatchInterval: 2000,
    checkPassInterval: 1500,
    speedCheckInterval: 3000
};

/**
 * 自动跳题模块
 */
const AutoSkip = {
    intervalId: null,

    toggle(isEnabled) {
        isEnabled ? this.start() : this.stop();
    },

    start() {
        if (this.intervalId) {
            DebugLogger.debug('AutoSkip', '自动跳题已在运行，无需重复启动');
            return;
        }
        this.intervalId = setInterval(() => this.checkAndSkip(), Config.skipQuestionInterval);
        DebugLogger.log('AutoSkip', '自动跳题已开启，检查间隔：' + Config.skipQuestionInterval + 'ms');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            DebugLogger.log('AutoSkip', '自动跳题已关闭');
        } else {
            DebugLogger.debug('AutoSkip', '自动跳题未运行，无需停止');
        }
    },

    // 简化后的 checkAndSkip 函数
    checkAndSkip() {
        try {
            // 定义要查找的跳过文本
            const skipText = '跳过';
            // 第一步：通过选择器查找包含跳过文本的按钮
            let targetButton = Array.from(document.querySelectorAll('button, a, span.btn, div.btn')).find(
                btn => btn.textContent.trim() === skipText
            );

            // 第二步：如果没找到，用XPath兜底查找
            if (!targetButton) {
                const xpathResult = document.evaluate(
                    `//*[text()="${skipText}"]`, 
                    document, 
                    null, 
                    XPathResult.FIRST_ORDERED_NODE_TYPE, 
                    null
                );
                targetButton = xpathResult.singleNodeValue;
            }

            // 第三步：找到按钮且未点击过，则执行点击
            if (targetButton && !targetButton.dataset.skipClicked) {
                targetButton.dataset.skipClicked = 'true';
                targetButton.click(); // 简化事件触发方式
                DebugLogger.log('AutoSkip', '已自动跳过题目');
                // 5秒后清除标记，允许再次点击
                setTimeout(() => delete targetButton.dataset.skipClicked, 5000);
            }
        } catch (error) {
            DebugLogger.error('AutoSkip', '自动跳题出错', error);
        }
    }
};

/**
 * 自动连播模块
 */
const AutoPlay = {
    intervalId: null,
    // 新增：配置播放进度阈值（85%），方便后续调整
    progressThreshold: 0.85,

    toggle(isEnabled) {
        isEnabled ? this.start() : this.stop();
    },

    start() {
        if (this.intervalId) {
            DebugLogger.debug('AutoPlay', '自动连播已运行');
            return;
        }
        this.intervalId = setInterval(() => this.checkAndSwitch(), Config.rewatchInterval);
        DebugLogger.log('AutoPlay', '自动连播已开启');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            DebugLogger.log('AutoPlay', '自动连播已关闭');
        }
    },

    checkAndSwitch() {
        try {
            DebugLogger.debug('AutoPlay', '检查是否需要切换视频');

            // 判断播放进度是否达到85%
            //找到视频元素
            const videoElement = document.querySelector('video'); // 通用视频标签选择器

            // 无视频元素则直接返回
            if (!videoElement) {
                DebugLogger.debug('AutoPlay', '未找到视频播放元素');
                return;
            }

            //获取视频当前播放时间和总时长
            const currentTime = videoElement.currentTime; // 当前播放到的秒数
            const duration = videoElement.duration; // 视频总时长

            //过滤无效值
            if (isNaN(duration) || duration === Infinity || duration === 0) {
                DebugLogger.debug('AutoPlay', '视频时长未加载完成，暂不检查');
                return;
            }

            // 计算播放进度=80%
            const progress = currentTime / duration;
            if (progress < this.progressThreshold) {
                DebugLogger.debug('AutoPlay', `当前播放进度${(progress*100).toFixed(1)}%，未达到85%，不切换`);
                return;
            }
            //原逻辑保留
            const videoListContainer = document.querySelector('.listCon-zrsBh');
            const activeVideo = videoListContainer?.querySelector('.item-blpma.active-EI2Hl');
            if (!videoListContainer || !activeVideo) {
                DebugLogger.debug('AutoPlay', '未找到视频列表或当前播放项');
                return;
            }

            let nextVideo = activeVideo.nextElementSibling;
            while (nextVideo) {
                if (nextVideo.classList.contains('item-blpma') && !nextVideo.querySelector('.finished-PsNX9')) {
                    nextVideo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    DebugLogger.log('AutoPlay', `播放进度达到${(this.progressThreshold*100)}%，已切换下一个视频`);
                    break;
                }
                nextVideo = nextVideo.nextElementSibling;
            }

            if (!nextVideo) {
                DebugLogger.debug('AutoPlay', '未找到下一个未完成的视频');
            }
        } catch (error) {
            DebugLogger.error('AutoPlay', '自动连播出错', error);
        }
    }
};

/**
 * 自动过检模块
 */
const AutoCheckPass = {
    intervalId: null,

    toggle(isEnabled) {
        isEnabled ? this.start() : this.stop();
    },

    start() {
        if (this.intervalId) {
            DebugLogger.debug('AutoCheckPass', '已在运行');
            return;
        }
        this.intervalId = setInterval(() => this.checkAndClick(), Config.checkPassInterval);
        DebugLogger.log('AutoCheckPass', '自动过检已开启');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            DebugLogger.log('AutoCheckPass', '自动过检已关闭');
        }
    },

    checkAndClick() {
        try {
            const checkButton = document.querySelector('span.btn-DOCWn');
            if (checkButton && checkButton.textContent.trim() === '点击通过检查') {
                if (checkButton.dataset.checkClicked) return;
                checkButton.dataset.checkClicked = 'true';
                checkButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                DebugLogger.log('AutoCheckPass', '已自动通过检查');
                setTimeout(() => delete checkButton.dataset.checkClicked, 3000);
            }
        } catch (error) {
            DebugLogger.error('AutoCheckPass', '过检出错', error);
        }
    }
};

/**
 * 倍速控制模块
 */
const SpeedControl = {
    intervalId: null,
    targetSpeed: '1X',

    toggle(isEnabled) {
        if (isEnabled) {
            this.setSpeed('2X');
            this.start();
        } else {
            this.setSpeed('1X');
            this.stop();
        }
    },

    start() {
        if (this.intervalId) return;
        this.intervalId = setInterval(() => this.ensureSpeed(), Config.speedCheckInterval);
        DebugLogger.log('SpeedControl', '2倍速已开启');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            DebugLogger.log('SpeedControl', '2倍速已关闭');
        }
    },

    setSpeed(speed) {
        this.targetSpeed = speed;
        this.ensureSpeed();
    },

    ensureSpeed() {
        try {
            const speedItems = document.querySelectorAll('.vjs-menu-content .vjs-menu-item');
            for (const item of speedItems) {
                const t = item.querySelector('.vjs-menu-item-text')?.textContent.trim();
                if (t === this.targetSpeed && !item.classList.contains('vjs-selected')) {
                    item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    DebugLogger.log('SpeedControl', `已设为${this.targetSpeed}`);
                    break;
                }
            }
        } catch (error) {
            DebugLogger.error('SpeedControl', '倍速出错', error);
        }
    }
};

/**
 * 刷课模式
 */
const CourseBrushMode = {
    enable() {
        GUI.setToggleState('autoSkip', true);
        GUI.setToggleState('autoPlay', true);
        GUI.setToggleState('autoCheckPass', true);
        GUI.setToggleState('speedControl', true);
        AutoSkip.toggle(true);
        AutoPlay.toggle(true);
        AutoCheckPass.toggle(true);
        SpeedControl.toggle(true);
        DebugLogger.log('CourseBrushMode', '刷课模式已开启');
    },
    disable() {
        GUI.setToggleState('autoSkip', false);
        GUI.setToggleState('autoPlay', false);
        GUI.setToggleState('autoCheckPass', false);
        GUI.setToggleState('speedControl', false);
        AutoSkip.toggle(false);
        AutoPlay.toggle(false);
        AutoCheckPass.toggle(false);
        SpeedControl.toggle(false);
        DebugLogger.log('CourseBrushMode', '刷课模式已关闭');
    },
    toggle(isEnabled) {
        isEnabled ? this.enable() : this.disable();
    }
};

/**
 * GUI界面（精简冗余逻辑，保留全部功能）
 */
const GUI = {
    isMenuOpen: false,
    state: {
        autoSkip: false,
        autoPlay: false,
        autoCheckPass: false,
        speedControl: false,
        courseBrushMode: false,
        hasShownGuide: false
    },

    init() {
        this.loadConfig();
        this.createStyles();
        this.createMenuButton();
        this.createMenuPanel();
        this.restoreModuleStates();
        this.createGuideOverlay();
        DebugLogger.log('GUI', '界面初始化完成');
    },

    loadConfig() {
        try {
            const c = localStorage.getItem('ewt_helper_config');
            if (c) this.state = { ...this.state, ...JSON.parse(c) };
        } catch (e) {}
    },

    saveConfig() {
        try { localStorage.setItem('ewt_helper_config', JSON.stringify(this.state)); } catch (e) {}
    },

    restoreModuleStates() {
        if (this.state.courseBrushMode) {
            CourseBrushMode.toggle(true);
            return;
        }
        if (this.state.autoSkip) AutoSkip.toggle(true);
        if (this.state.autoPlay) AutoPlay.toggle(true);
        if (this.state.autoCheckPass) AutoCheckPass.toggle(true);
        if (this.state.speedControl) SpeedControl.toggle(true);
    },

    createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .ewt-helper-container{position:fixed;bottom:20px;right:20px;z-index:99999;font-family:Arial,sans-serif;}
            .ewt-menu-button{width:50px;height:50px;border-radius:50%;background:#4CAF50;color:white;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 8px rgba(0,0,0,0.2);transition:all .3s;}
            .ewt-menu-button:hover{background:#45a049;transform:scale(1.05);}
            .ewt-menu-panel{position:absolute;bottom:60px;right:0;width:250px;background:white;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:15px;display:none;flex-direction:column;gap:10px;}
            .ewt-menu-panel.open{display:flex;}
            .ewt-menu-title{font-size:18px;font-weight:bold;color:#333;margin-bottom:10px;text-align:center;padding-bottom:5px;border-bottom:1px solid #eee;}
            .ewt-toggle-item{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f5f5f5;}
            .ewt-toggle-label{font-size:14px;color:#555;}
            .ewt-toggle-label.brush-mode{color:#2196F3;font-weight:bold;}
            .ewt-switch{position:relative;display:inline-block;width:40px;height:24px;}
            .ewt-switch input{opacity:0;width:0;height:0;}
            .ewt-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ccc;transition:.4s;border-radius:24px;}
            .ewt-slider:before{position:absolute;content:"";height:16px;width:16px;left:4px;bottom:4px;background:white;transition:.4s;border-radius:50%;}
            input:checked+.ewt-slider{background:#4CAF50;}
            input:checked+.ewt-slider:before{transform:translateX(16px);}
            .ewt-guide-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99998;display:flex;flex-direction:column;justify-content:center;align-items:center;}
            .ewt-guide-text{color:white;font-size:24px;font-weight:bold;margin-bottom:20px;text-align:center;line-height:1.5;}
            .ewt-guide-arrow{position:fixed;bottom:80px;right:80px;color:white;font-size:60px;font-weight:bold;animation:ewt-bounce 1.5s infinite;transform:rotate(45deg);}
            @keyframes ewt-bounce{0%,100%{transform:translate(0,0) rotate(45deg);}50%{transform:translate(15px,15px) rotate(45deg);}}
        `;
        document.head.appendChild(style);
    },

    createMenuButton() {
        // 先清除旧按钮，防止重复创建
        const oldContainer = document.querySelector('.ewt-helper-container');
        if (oldContainer) {
            oldContainer.remove();
            DebugLogger.debug('GUI', '清除旧的GUI容器');
        }

        DebugLogger.debug('GUI', '创建菜单按钮');
        const container = document.createElement('div');
        container.className = 'ewt-helper-container';
        const btn = document.createElement('button');
        btn.className = 'ewt-menu-button';
        btn.innerHTML = '📚';
        btn.title = '升学E网通助手';
        btn.onclick = () => this.toggleMenu();
        container.appendChild(btn);
        document.body.appendChild(container);
    },

    createGuideOverlay() {
        if (this.state.hasShownGuide) return;
        const overlay = document.createElement('div');
        overlay.className = 'ewt-guide-overlay';
        const text = document.createElement('div');
        text.className = 'ewt-guide-text';
        text.innerHTML = '欢迎使用升学E网通助手！<br>请点击右下角绿色图标打开控制面板';
        const arrow = document.createElement('div');
        arrow.className = 'ewt-guide-arrow';
        arrow.textContent = '👉';
        overlay.appendChild(text);
        overlay.appendChild(arrow);
        document.body.appendChild(overlay);
        this.guideOverlay = overlay;
    },

    createMenuPanel() {
        const panel = document.createElement('div');
        panel.className = 'ewt-menu-panel';
        const title = document.createElement('div');
        title.className = 'ewt-menu-title';
        title.textContent = '升学E网通助手';
        panel.appendChild(title);

        panel.appendChild(this.createToggleItem('autoSkip', '自动跳题', v => AutoSkip.toggle(v)));
        panel.appendChild(this.createToggleItem('autoPlay', '自动连播', v => AutoPlay.toggle(v)));
        panel.appendChild(this.createToggleItem('autoCheckPass', '自动过检', v => AutoCheckPass.toggle(v)));
        panel.appendChild(this.createToggleItem('speedControl', '2倍速播放', v => SpeedControl.toggle(v)));
        panel.appendChild(this.createToggleItem('courseBrushMode', '刷课模式', v => CourseBrushMode.toggle(v), true));

        document.querySelector('.ewt-helper-container').appendChild(panel);
    },

    createToggleItem(id, label, onChange, isBrush = false) {
        const item = document.createElement('div');
        item.className = 'ewt-toggle-item';
        const lab = document.createElement('label');
        lab.className = 'ewt-toggle-label ' + (isBrush ? 'brush-mode' : '');
        lab.textContent = label;
        const sw = document.createElement('label');
        sw.className = 'ewt-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `ewt-toggle-${id}`; // 补全id，确保setToggleState能找到
        input.checked = this.state[id];
        const slider = document.createElement('span');
        slider.className = 'ewt-slider';
        sw.appendChild(input);
        sw.appendChild(slider);
        item.appendChild(lab);
        item.appendChild(sw);

        input.onchange = e => {
            this.state[id] = e.target.checked;
            this.saveConfig();
            onChange(e.target.checked);
        };
        return item;
    },

    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
        const panel = document.querySelector('.ewt-menu-panel');
        this.isMenuOpen ? panel.classList.add('open') : panel.classList.remove('open');
        if (this.isMenuOpen && this.guideOverlay) {
            this.guideOverlay.remove();
            this.guideOverlay = null;
            this.state.hasShownGuide = true;
            this.saveConfig();
        }
    },

    setToggleState(id, checked) {
        this.state[id] = checked;
        this.saveConfig();
        const el = document.getElementById(`ewt-toggle-${id}`);
        if (el) {
            el.checked = checked;
            DebugLogger.debug('GUI', `更新Toggle状态：${id}=${checked}`);
        }
    }
};

/**
 * 修复刷新后GUI消失的核心初始化逻辑
 */
(function() {
    'use strict';
    let staticRetryCount = 0; // 重试计数

    /**
     * 安全初始化GUI的核心函数
     * 确保DOM就绪后再创建GUI，失败自动重试
     */
    function safeInitGUI() {
        // 先检查DOM是否就绪（body存在）
        if (!document.body) {
            // DOM未就绪，500ms后重试
            setTimeout(safeInitGUI, 500);
            DebugLogger.debug('Main', 'DOM未就绪，延迟重试初始化');
            return;
        }

        try {
            // 执行GUI初始化
            GUI.init();
            DebugLogger.log('Main', '升学E网通助手已加载 (v2.2.0)，GUI初始化成功');
        } catch (error) {
            // 初始化失败，1秒后重试（最多重试3次）
            staticRetryCount++;
            if (staticRetryCount < 3) {
                setTimeout(safeInitGUI, 1000);
                DebugLogger.error('Main', `GUI初始化失败，第${staticRetryCount}次重试`, error);
            } else {
                DebugLogger.error('Main', 'GUI初始化重试3次失败，请检查页面');
                // 最后尝试直接创建核心按钮，保障基础功能
                if (document.body && !document.querySelector('.ewt-helper-container')) {
                    const container = document.createElement('div');
                    container.className = 'ewt-helper-container';
                    const btn = document.createElement('button');
                    btn.className = 'ewt-menu-button';
                    btn.innerHTML = '📚';
                    btn.title = '升学E网通助手';
                    container.appendChild(btn);
                    document.body.appendChild(container);
                }
            }
        }
    }

    // 方案1：优先监听DOMContentLoaded（比load更早触发）
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        // DOM已就绪，立即初始化
        safeInitGUI();
    } else {
        // DOM未就绪，监听就绪事件
        document.addEventListener('DOMContentLoaded', safeInitGUI);
    }

    // 方案2：兜底监听load事件（防止DOMContentLoaded漏触发）
    window.addEventListener('load', safeInitGUI);

    // 方案3：监听页面DOM变化（针对SPA页面刷新/路由跳转）
    const observer = new MutationObserver((mutations) => {
        const hasBody = document.body;
        const hasGUI = document.querySelector('.ewt-helper-container');
        if (hasBody && !hasGUI) {
            DebugLogger.debug('Main', '检测到DOM变化，重新初始化GUI');
            safeInitGUI();
            // 初始化成功后停止监听，避免重复触发
            observer.disconnect();
        }
    });
    // 监听根节点的子元素变化
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    });

    // 方案4：窗口焦点恢复时检查GUI（比如刷新后切回标签页）
    window.addEventListener('focus', () => {
        if (document.body && !document.querySelector('.ewt-helper-container')) {
            DebugLogger.debug('Main', '窗口获得焦点，重新创建GUI');
            safeInitGUI();
        }
    });
})();



