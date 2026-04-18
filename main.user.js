// ==UserScript==
// @name         升学E网通助手 v2 Lite
// @namespace    https://github.com/ZNink/EWT360-Helper
// @version      2.4.2
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
    speedCheckInterval: 3000,
    playMode: {
        PROGRESS_85: 'progress85',
        FULL_PLAY: 'fullPlay'
    }
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

    checkAndSkip() {
        try {
            const skipText = '跳过';
            let targetButton = Array.from(document.querySelectorAll('button, a, span.btn, div.btn')).find(
                btn => btn.textContent.trim() === skipText
            );

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

            if (targetButton && !targetButton.dataset.skipClicked) {
                targetButton.dataset.skipClicked = 'true';
                targetButton.click();
                DebugLogger.log('AutoSkip', '已自动跳过题目');
                setTimeout(() => delete targetButton.dataset.skipClicked, 5000);
            }
        } catch (error) {
            DebugLogger.error('AutoSkip', '自动跳题出错', error);
        }
    }
};

/**
 * 自动连播模块（已修改：看完连播 = 检测进度图片）
 */
const AutoPlay = {
    intervalId: null,
    progressThreshold: 0.85,
    currentMode: Config.playMode.PROGRESS_85,

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

    updatePlayMode(mode) {
        this.currentMode = mode;
        if (mode === Config.playMode.PROGRESS_85) {
            this.progressThreshold = 0.85;
        }
        DebugLogger.log('AutoPlay', `连播模式已切换：${mode === Config.playMode.PROGRESS_85 ? '85%进度' : '检测图片看完后'}`);
    },

    checkAndSwitch() {
        try {
            const videoListContainer = document.querySelector('.listCon-zrsBh');
            const activeVideo = videoListContainer?.querySelector('.item-blpma.active-EI2Hl');
            if (!videoListContainer || !activeVideo) return;

            let canPlayNext = false;

            if (this.currentMode === Config.playMode.PROGRESS_85) {
                const video = document.querySelector('video');
                if (!video) return;
                const current = video.currentTime;
                const total = video.duration;
                if (isNaN(total) || total <= 0) return;
                canPlayNext = current / total >= this.progressThreshold;
            } else {
                const img = document.querySelector('img.progress-img-vkUYM[src="//file.ewt360.com/file/1820894120067424424"]');
                canPlayNext = !!img;
                if (img) DebugLogger.log('AutoPlay', '检测到已看完图片，准备连播');
            }

            if (!canPlayNext) return;

            let nextVideo = activeVideo.nextElementSibling;
            while (nextVideo) {
                if (nextVideo.classList.contains('item-blpma') && !nextVideo.querySelector('.finished-PsNX9')) {
                    nextVideo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    DebugLogger.log('AutoPlay', '已自动切换下一个视频');
                    break;
                }
                nextVideo = nextVideo.nextElementSibling;
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
 * GUI界面
 */
const GUI = {
    isMenuOpen: false,
    state: {
        autoSkip: false,
        autoPlay: false,
        autoCheckPass: false,
        speedControl: false,
        courseBrushMode: false,
        hasShownGuide: false,
        playMode: Config.playMode.PROGRESS_85
    },

    init() {
        this.loadConfig();
        this.createStyles();
        this.createMenuButton();
        this.createMenuPanel();
        this.restoreModuleStates();
        this.createGuideOverlay();
        AutoPlay.updatePlayMode(this.state.playMode);
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
            .ewt-menu-panel{position:absolute;bottom:60px;right:0;width:280px;background:white;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:15px;display:none;flex-direction:column;gap:10px;}
            .ewt-menu-panel.open{display:flex;}
            .ewt-menu-title{font-size:18px;font-weight:bold;color:#333;margin-bottom:10px;text-align:center;padding-bottom:5px;border-bottom:1px solid #eee;}
            .ewt-toggle-item{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f5f5f5;}
            .ewt-toggle-label{font-size:14px;color:#555;}
            .ewt-toggle-label.brush-mode{color:#2196F3;font-weight:bold;}
            .ewt-playmode-group{padding:8px 0;border-bottom:1px solid #f5f5f5;}
            .ewt-playmode-title{font-size:14px;color:#555;margin-bottom:8px;}
            .ewt-playmode-buttons{display:flex;gap:8px;}
            .ewt-playmode-btn{flex:1;padding:6px 0;border-radius:4px;border:1px solid #ddd;background:#fff;color:#555;cursor:pointer;text-align:center;font-size:13px;transition:all .2s;}
            .ewt-playmode-btn.active{background:#4CAF50;color:white;border-color:#4CAF50;}
            .ewt-playmode-btn:hover{background:#f5f5f5;}
            .ewt-playmode-btn.active:hover{background:#45a049;}
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
        const oldContainer = document.querySelector('.ewt-helper-container');
        if (oldContainer) oldContainer.remove();
        const container = document.createElement('div');
        container.className = 'ewt-helper-container';
        const btn = document.createElement('button');
        btn.className = 'ewt-menu-button';
        btn.innerHTML = '📚';
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
        panel.appendChild(this.createPlayModeGroup());
        panel.appendChild(this.createToggleItem('autoSkip', '自动跳题', v => AutoSkip.toggle(v)));
        panel.appendChild(this.createToggleItem('autoPlay', '自动连播', v => AutoPlay.toggle(v)));
        panel.appendChild(this.createToggleItem('autoCheckPass', '自动过检', v => AutoCheckPass.toggle(v)));
        panel.appendChild(this.createToggleItem('speedControl', '2倍速播放', v => SpeedControl.toggle(v)));
        panel.appendChild(this.createToggleItem('courseBrushMode', '刷课模式', v => CourseBrushMode.toggle(v), true));
        document.querySelector('.ewt-helper-container').appendChild(panel);
    },

    createPlayModeGroup() {
        const group = document.createElement('div');
        group.className = 'ewt-playmode-group';
        const title = document.createElement('div');
        title.className = 'ewt-playmode-title';
        title.textContent = '连播模式选择';
        group.appendChild(title);
        const buttons = document.createElement('div');
        buttons.className = 'ewt-playmode-buttons';

        const btn85 = document.createElement('button');
        btn85.className = `ewt-playmode-btn ${this.state.playMode === Config.playMode.PROGRESS_85 ? 'active' : ''}`;
        btn85.textContent = '85%进度连播';
        btn85.onclick = () => {
            this.state.playMode = Config.playMode.PROGRESS_85;
            AutoPlay.updatePlayMode(Config.playMode.PROGRESS_85);
            this.updatePlayModeButtons();
            this.saveConfig();
        };

        const btnFull = document.createElement('button');
        btnFull.className = `ewt-playmode-btn ${this.state.playMode === Config.playMode.FULL_PLAY ? 'active' : ''}`;
        btnFull.textContent = '看完后连播';
        btnFull.onclick = () => {
            this.state.playMode = Config.playMode.FULL_PLAY;
            AutoPlay.updatePlayMode(Config.playMode.FULL_PLAY);
            this.updatePlayModeButtons();
            this.saveConfig();
        };

        buttons.appendChild(btn85);
        buttons.appendChild(btnFull);
        group.appendChild(buttons);
        return group;
    },

    updatePlayModeButtons() {
        const btns = document.querySelectorAll('.ewt-playmode-btn');
        btns.forEach(b => b.classList.remove('active'));
        if (this.state.playMode === Config.playMode.PROGRESS_85) btns[0].classList.add('active');
        else btns[1].classList.add('active');
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
        input.id = `ewt-toggle-${id}`;
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
        if (el) el.checked = checked;
    }
};

(function() {
    'use strict';
    let retry = 0;
    function init() {
        if (!document.body) return setTimeout(init, 500);
        try {
            GUI.init();
        } catch (e) {
            if (retry++ < 3) setTimeout(init, 1000);
        }
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') init();
    else document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('load', init);
    new MutationObserver((m, o) => {
        if (document.body && !document.querySelector('.ewt-helper-container')) { init(); o.disconnect(); }
    }).observe(document.documentElement, { childList: true, subtree: true });
})();
