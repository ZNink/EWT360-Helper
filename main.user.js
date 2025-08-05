// ==UserScript==
// @name         升学E网通助手（增强版）
// @namespace    https://www.yuzu-soft.com/products.html
// @version      1.5.0
// @description  自动通过随机检查、自动播放下一视频、自动跳题（仅作业页面生效），支持1x至16x倍速调节，倍速自动维持，新增模式切换功能，优化挂机模式，支持自定义跳过科目
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @author       仅供学习交流，严禁用于商业用途，请于24小时内删除
// @icon         https://www.ewt360.com/favicon.ico
// @grant        none
// 此脚本完全免费，倒卖的人绝对私募了XD
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 配置管理模块 - 处理配置的加载和保存
     */
    const ConfigManager = {
        // 默认配置
        defaultConfig: {
                speed: 1,
                autoCheckEnabled: true,
                autoPlayEnabled: true,
                autoSkipEnabled: true,
                speedControlEnabled: true, // 倍速功能是否启用
                mode: 'normal',
                hangupModeEnabled: false, // 挂机模式状态
                lastVolume: 1, // 保存最后一次音量设置
                hangupSkipSubjects: [],
                showSpeedWarning: true, // 是否显示倍速提醒
                soundEnabled: true // 是否播放提示音
            },

        // 当前配置
        config: {},

        // 初始化配置
        init() {
            try {
                const savedConfig = localStorage.getItem('ewtHelperConfig');
                if (savedConfig) {
                    const parsedConfig = JSON.parse(savedConfig);
                    this.config = { ...this.defaultConfig, ...parsedConfig };
                } else {
                    this.config = { ...this.defaultConfig };
                }
            } catch (e) {
                console.warn('无法读取或解析本地存储的配置:', e);
                this.config = { ...this.defaultConfig };
            }
            return this.config;
        },

        // 保存配置到本地存储
        save() {
            try {
                localStorage.setItem('ewtHelperConfig', JSON.stringify(this.config));
            } catch (e) {
                console.warn('无法保存配置到本地存储:', e);
            }
        },

        // 更新特定配置项
        update(key, value) {
            if (Object.keys(this.defaultConfig).includes(key)) {
                this.config[key] = value;
                this.save();
            } else {
                console.warn(`未知的配置项: ${key}`);
            }
        },

        // 获取配置
        get(key) {
            return this.config[key];
        }
    };

    /**
     * 配置模块 - 存储脚本所有可配置参数
     */
    const Config = {
        // 功能检查间隔（毫秒）
        checkInterval: 1000,      // 自动过检检查间隔
        rewatchInterval: 1000,    // 视频连连播检查间隔
        skipQuestionInterval: 1000, // 自动跳题检查间隔
        speedReapplyInterval: 1000, // 倍速自动重应用间隔（1秒）
        subjectCheckInterval: 1000, // 科目信息检查间隔（3秒）
        hangupCheckInterval: 1000, // 挂机模式检查间隔（1秒）
        playCheckInterval: 500,   // 播放状态检查间隔（0.5秒）
        // 控制面板样式
        panelOpacity: 0.9,        // 常态透明度
        panelHoverOpacity: 1.0,   // hover时透明度
        // 目标路径匹配规则
        targetHashPath: '#/homework/', // 作业页面哈希路径前缀
        // 所有可能的科目列表（用于设置弹窗）
        allSubjects: ['语文', '英语', '数学', '历史', '政治', '生物', '地理', '物理', '化学', '信息技术', '通用技术', '音乐', '美术', '体育', '科学', '品德', '综合实践']
    };

    /**
     * 统计模块 - 管理脚本运行数据
     */
    const Stats = {
        data: {
            videoPlayCount: 0,       // 累计连播视频数
            totalCheckCount: 0,      // 累计过检次数
            skippedQuestionCount: 0, // 累计跳题次数
            skippedVideoCount: 0,    // 累计跳过视频数（挂机模式，不显示）
            startTime: new Date(),   // 脚本启动时间
            runTime: '00:00:00',     // 累计运行时长
            currentSubject: '未播放' // 当前播放视频的科目（不显示）
        },

        updateDisplay() {
            document.getElementById('videoCount').textContent = this.data.videoPlayCount;
            document.getElementById('totalCheckCount').textContent = this.data.totalCheckCount;
            document.getElementById('skippedQuestionCount').textContent = this.data.skippedQuestionCount;
            document.getElementById('runTime').textContent = this.data.runTime;
        },

        updateRunTime() {
            const now = new Date();
            const durationMs = now - this.data.startTime;
            const hours = Math.floor(durationMs / 3600000).toString().padStart(2, '0');
            const minutes = Math.floor((durationMs % 3600000) / 60000).toString().padStart(2, '0');
            const seconds = Math.floor((durationMs % 60000) / 1000).toString().padStart(2, '0');
            this.data.runTime = `${hours}:${minutes}:${seconds}`;
            this.updateDisplay();
        },

        updateSubject(subject) {
            if (subject && subject !== this.data.currentSubject) {
                this.data.currentSubject = subject;
            }
        }
    };

    /**
     * 防干扰模块 - 处理视频倍速限制
     */
    const AntiInterference = {
        // 保存原始的视频事件和属性，用于恢复
        originalProperties: new Map(),

        init() {
            this.proxyVideoElements();
            this.observeNewVideos();
        },

        // 代理所有现有视频元素
        proxyVideoElements() {
            document.querySelectorAll('video').forEach(video => {
                this.proxyVideo(video);
            });
        },

        // 监听新添加的视频元素
        observeNewVideos() {
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.tagName === 'VIDEO') {
                            this.proxyVideo(node);
                        } else if (node.querySelectorAll) {
                            node.querySelectorAll('video').forEach(video => {
                                this.proxyVideo(video);
                            });
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        },

        // 代理视频元素以控制倍速
        proxyVideo(video) {
            if (this.originalProperties.has(video)) return;

            // 保存原始属性和方法
            const originalPlaybackRate = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
            const originalAddEventListener = video.addEventListener;
            const originalRemoveEventListener = video.removeEventListener;

            this.originalProperties.set(video, {
                playbackRate: originalPlaybackRate,
                addEventListener: originalAddEventListener,
                removeEventListener: originalRemoveEventListener
            });

            // 重写playbackRate属性
            Object.defineProperty(video, 'playbackRate', {
                get() {
                    return originalPlaybackRate.get.call(this);
                },
                set(value) {
                    originalPlaybackRate.set.call(this, value);
                    this.dispatchEvent(new Event('ewtRateChange'));
                },
                configurable: true
            });

            // 重写事件监听方法以过滤ratechange事件
            video.addEventListener = function(type, listener, options) {
                if (type === 'ratechange') {
                    this.__rateChangeListeners = this.__rateChangeListeners || [];
                    this.__rateChangeListeners.push({ listener, options });
                    return;
                }
                return originalAddEventListener.call(this, type, listener, options);
            };

            video.removeEventListener = function(type, listener, options) {
                if (type === 'ratechange' && this.__rateChangeListeners) {
                    this.__rateChangeListeners = this.__rateChangeListeners.filter(
                        item => !(item.listener === listener && item.options === options)
                    );
                    return;
                }
                return originalRemoveEventListener.call(this, type, listener, options);
            };

            console.log('视频倍速保护已启用');
        },

        // 恢复视频元素原始状态
        restoreVideo(video) {
            if (!this.originalProperties.has(video)) return;

            const originals = this.originalProperties.get(video);

            // 恢复playbackRate属性
            Object.defineProperty(video, 'playbackRate', originals.playbackRate);

            // 恢复事件监听方法
            video.addEventListener = originals.addEventListener;
            video.removeEventListener = originals.removeEventListener;

            // 移除保存的属性
            this.originalProperties.delete(video);

            console.log('视频原始倍速控制已恢复');
        },

        // 恢复所有视频元素的原始状态
        restoreAllVideos() {
            this.originalProperties.forEach((_, video) => {
                this.restoreVideo(video);
            });
        },

        // 重新代理所有视频元素
        reProxyAllVideos() {
            this.restoreAllVideos();
            this.proxyVideoElements();
        }
    };

    /**
     * 倍速控制模块
     */
    const SpeedControl = {
        speeds: [1, 1.25, 1.5, 1.75, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16],
        currentSpeed: 1,
        reapplyIntervalId: null,
        isEnabled: true,
        // 保存挂机模式激活前的倍速设置
        preHangupSpeed: 1,

        init() {
            // 从配置加载保存的倍速和开关状态
            const savedSpeed = ConfigManager.get('speed');
            this.isEnabled = ConfigManager.get('speedControlEnabled');

            if (this.speeds.includes(savedSpeed)) {
                this.currentSpeed = savedSpeed;
                this.preHangupSpeed = savedSpeed; // 初始化挂机前的速度
            }

            // 根据开关状态决定初始化行为
            if (this.isEnabled) {
                this.startReapply();
            } else {
                this.disableSpeedControl();
            }

            // 更新UI显示状态
            this.updateSpeedControlUI();
        },

        // 启动倍速重应用定时器
        startReapply() {
            if (this.reapplyIntervalId) return;
            this.reapplyIntervalId = setInterval(() => {
                this.reapplySpeed();
            }, Config.speedReapplyInterval);
        },

        // 停止倍速重应用定时器
        stopReapply() {
            if (this.reapplyIntervalId) {
                clearInterval(this.reapplyIntervalId);
                this.reapplyIntervalId = null;
            }
        },

        // 切换倍速功能开关
        toggle(isEnabled) {
            // 如果在挂机模式下，不允许修改倍速开关
            if (ConfigManager.get('hangupModeEnabled')) return;

            this.isEnabled = isEnabled;

            if (isEnabled) {
                this.enableSpeedControl();
            } else {
                this.disableSpeedControl();
            }

            // 保存开关状态
            ConfigManager.update('speedControlEnabled', isEnabled);
            // 更新UI
            this.updateSpeedControlUI();
        },

        // 启用倍速控制
        enableSpeedControl() {
            // 重新代理视频元素
            AntiInterference.reProxyAllVideos();
            // 应用保存的倍速
            this.setSpeed(this.currentSpeed);
            // 启动重应用定时器
            this.startReapply();
        },

        // 禁用倍速控制
        disableSpeedControl() {
            // 停止重应用定时器
            this.stopReapply();
            // 恢复视频原始控制
            AntiInterference.restoreAllVideos();
            // 恢复为1x倍速
            this.resetToNormalSpeed();
        },

        // 重置为正常速度
        resetToNormalSpeed() {
            try {
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    video.playbackRate = 1;
                });
            } catch (error) {
                console.error('重置为正常速度失败:', error);
            }
        },

        // 更新倍速控制UI显示
        updateSpeedControlUI() {
            const speedControlArea = document.getElementById('speedControlArea');
            if (speedControlArea) {
                speedControlArea.style.display = this.isEnabled ? 'flex' : 'none';
            }
        },

        reapplySpeed() {
            if (!this.isEnabled) return;

            // 挂机模式下强制维持1.0倍速
            const targetSpeed = ConfigManager.get('hangupModeEnabled') ? 1.0 : this.currentSpeed;

            try {
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    if (Math.abs(video.playbackRate - targetSpeed) > 0.1) {
                        video.playbackRate = targetSpeed;
                        console.log(`已重新应用倍速: ${targetSpeed}x`);
                    }
                });
            } catch (error) {
                console.error('倍速重应用失败:', error);
            }
        },

        setSpeed(speed) {
            // 挂机模式下不允许修改倍速
            if (ConfigManager.get('hangupModeEnabled')) return;

            if (!this.isEnabled) return;
            
            // 如果不是1x倍速且需要显示提醒
            if (speed !== 1 && ConfigManager.get('showSpeedWarning')) {
                this.showSpeedWarning();
            }

            try {
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    video.playbackRate = speed;
                });
                this.currentSpeed = speed;
                this.preHangupSpeed = speed; // 更新挂机前的速度
                // 保存倍速到配置
                ConfigManager.update('speed', speed);
                const speedDisplay = document.getElementById('speedDisplay');
                if (speedDisplay) {
                    speedDisplay.textContent = `${speed}x`;
                }
            } catch (error) {
                console.error('设置倍速失败:', error);
            }
        },
        
        // 显示倍速提醒弹窗
        showSpeedWarning() {
            // 检查是否已有弹窗，避免重复显示
            if (document.getElementById('speedWarningDialog')) return;
            
            const dialog = document.createElement('div');
            dialog.id = 'speedWarningDialog';
            dialog.style.position = 'fixed';
            dialog.style.top = '50%';
            dialog.style.left = '50%';
            dialog.style.transform = 'translate(-50%, -50%)';
            dialog.style.backgroundColor = 'white';
            dialog.style.borderRadius = '8px';
            dialog.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2)';
            dialog.style.padding = '20px';
            dialog.style.zIndex = '10000';
            dialog.style.width = '300px';
            
            dialog.innerHTML = `
                <div style="margin-bottom: 15px; color: #333; font-weight: bold; font-size: 16px;">提示</div>
                <div style="margin-bottom: 15px; color: #666; font-size: 14px;">倍速播放可能不计入有效看课时长</div>
                <div style="display: flex; align-items: center; margin-bottom: 20px;">
                    <input type="checkbox" id="dontShowAgain" style="margin-right: 8px;">
                    <label for="dontShowAgain" style="color: #666; font-size: 13px;">不再提醒</label>
                </div>
                <div style="text-align: right;">
                    <button id="closeWarning" style="padding: 6px 15px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">知道了</button>
                </div>
            `;
            
            document.body.appendChild(dialog);
            
            // 添加关闭按钮事件
            dialog.querySelector('#closeWarning').addEventListener('click', () => {
                // 检查是否勾选了不再提醒
                const dontShowAgain = dialog.querySelector('#dontShowAgain').checked;
                if (dontShowAgain) {
                    ConfigManager.update('showSpeedWarning', false);
                }
                dialog.remove();
            });
            
            // 点击外部关闭
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    dialog.remove();
                }
            });
        },

        nextSpeed() {
            // 挂机模式下不允许修改倍速
            if (ConfigManager.get('hangupModeEnabled')) return;

            if (!this.isEnabled) return;

            const currentIndex = this.speeds.indexOf(this.currentSpeed);
            const nextIndex = (currentIndex + 1) % this.speeds.length;
            this.setSpeed(this.speeds[nextIndex]);
        },

        prevSpeed() {
            // 挂机模式下不允许修改倍速
            if (ConfigManager.get('hangupModeEnabled')) return;

            if (!this.isEnabled) return;

            const currentIndex = this.speeds.indexOf(this.currentSpeed);
            const prevIndex = (currentIndex - 1 + this.speeds.length) % this.speeds.length;
            this.setSpeed(this.speeds[prevIndex]);
        },

        // 挂机模式激活时调用，保存当前速度并设置为1.0
        activateHangupMode() {
            this.preHangupSpeed = this.currentSpeed;
            this.setSpeed(1.0);
        },

        // 挂机模式关闭时调用，恢复之前的速度
        deactivateHangupMode() {
            this.setSpeed(this.preHangupSpeed);
        }
    };

    /**
     * 模式控制模块 - 管理不同显示模式
     */
    const ModeControl = {
        currentMode: 'normal',

        init() {
            this.currentMode = ConfigManager.get('mode');
            this.applyMode();
        },

        toggleMode() {
            this.currentMode = this.currentMode === 'normal' ? 'minimal' : 'normal';
            ConfigManager.update('mode', this.currentMode);
            this.applyMode();
        },

        applyMode() {
            const statsArea = document.getElementById('statsArea');
            const speedControlArea = document.getElementById('speedControlArea');
            const modeButton = document.getElementById('modeToggleButton');

            if (this.currentMode === 'minimal') {
                // 极简模式: 隐藏统计信息
                if (statsArea) statsArea.style.display = 'none';
                if (modeButton) modeButton.textContent = '极简';
            } else {
                // 普通模式: 显示统计信息
                if (statsArea) statsArea.style.display = 'flex';
                if (modeButton) modeButton.textContent = '普通';
            }

            // 确保倍速控制区显示状态受SpeedControl控制
            if (speedControlArea) {
                speedControlArea.style.display = SpeedControl.isEnabled ? 'flex' : 'none';
            }
        }
    };

    /**
     * 科目信息模块 - 获取并更新当前播放视频的科目（不显示，仅内部使用）
     */
    const SubjectInfo = {
        intervalId: null,

        start() {
            if (this.intervalId) return;

            // 立即检查一次，然后定时检查
            this.checkCurrentSubject();
            this.intervalId = setInterval(() => {
                this.checkCurrentSubject();
            }, Config.subjectCheckInterval);
        },

        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

        checkCurrentSubject() {
            try {
                const videoListContainer = document.querySelector('.listCon-N9Rlm');
                if (!videoListContainer) return;

                // 获取当前正在播放的视频项
                const activeVideo = videoListContainer.querySelector('.item-IPNWw.active-1MWMf');
                if (!activeVideo) {
                    Stats.updateSubject('未播放');
                    return;
                }

                // 获取科目信息元素（left-SRI55）
                const subjectElement = activeVideo.querySelector('.left-SRI55');
                if (subjectElement) {
                    const subject = subjectElement.textContent.trim();
                    Stats.updateSubject(subject);
                } else {
                    Stats.updateSubject('未知科目');
                }
            } catch (error) {
                console.error('获取科目信息出错:', error);
            }
        }
    };

    /**
     * 挂机模式模块
     */
    const HangupMode = {
        intervalId: null,
        playCheckIntervalId: null,
        lastVolume: 1, // 保存挂机前的音量

        start() {
            if (this.intervalId) return;

            // 启动定时检查
            this.intervalId = setInterval(() => {
                this.checkAndSkipSubjectVideos();
            }, Config.hangupCheckInterval);

            // 启动播放状态检查（更频繁）
            this.playCheckIntervalId = setInterval(() => {
                this.checkPlayState();
            }, Config.playCheckInterval);
        },

        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }

            if (this.playCheckIntervalId) {
                clearInterval(this.playCheckIntervalId);
                this.playCheckIntervalId = null;
            }
        },

        // 检查视频播放状态，如暂停则继续播放
        checkPlayState() {
            // 如果挂机模式未开启，则不执行
            if (!ConfigManager.get('hangupModeEnabled')) return;

            try {
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    // 确保视频已加载且处于暂停状态
                    if (video.readyState > 0 && video.paused) {
                        console.log('挂机模式：检测到视频暂停，自动继续播放');
                        video.play().catch(e => {
                            console.log('挂机模式：自动播放失败，尝试其他方式', e);
                            // 尝试通过点击播放按钮
                            this.clickPlayButton();
                        });
                    }

                    // 确保音量为0
                    if (video.volume !== 0) {
                        video.volume = 0;
                        console.log('挂机模式：已将音量设置为0');
                    }
                });
            } catch (error) {
                console.error('挂机模式检查播放状态出错:', error);
            }
        },

        // 尝试点击页面上的播放按钮
        clickPlayButton() {
            try {
                // 尝试常见的播放按钮选择器
                const playButtons = document.querySelectorAll(
                    '.play-button, .video-play-btn, .icon-play, [class*="play"]'
                );

                playButtons.forEach(button => {
                    if (button && !button.disabled) {
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        button.dispatchEvent(clickEvent);
                        console.log('挂机模式：已尝试点击播放按钮');
                    }
                });
            } catch (error) {
                console.error('挂机模式点击播放按钮出错:', error);
            }
        },

        // 检查当前视频科目，如果是需要跳过的科目则跳过
        checkAndSkipSubjectVideos() {
            // 如果挂机模式未开启，则不执行
            if (!ConfigManager.get('hangupModeEnabled')) return;

            try {
                const currentSubject = Stats.data.currentSubject;
                const videoListContainer = document.querySelector('.listCon-N9Rlm');
                const skipSubjects = ConfigManager.get('hangupSkipSubjects');

                if (!videoListContainer || currentSubject === '未播放' || currentSubject === '未知科目') {
                    return;
                }

                // 检查当前科目是否在需要跳过的列表中
                if (skipSubjects.includes(currentSubject)) {
                    console.log(`挂机模式：检测到${currentSubject}视频，准备跳过`);

                    // 获取当前正在播放的视频项
                    const activeVideo = videoListContainer.querySelector('.item-IPNWw.active-1MWMf');
                    if (!activeVideo) return;

                    // 查找下一个视频
                    let nextVideo = activeVideo.nextElementSibling;
                    while (nextVideo) {
                        if (nextVideo.classList.contains('item-IPNWw')) {
                            // 触发点击事件，跳转到下一个视频
                            const clickEvent = new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window
                            });
                            nextVideo.dispatchEvent(clickEvent);

                            // 更新跳过视频计数（不显示）
                            Stats.data.skippedVideoCount++;

                            // 播放提示音
                            Utils.playSound('skip');

                            console.log(`挂机模式：已跳过${currentSubject}视频`);
                            return;
                        }
                        nextVideo = nextVideo.nextElementSibling;
                    }
                }
            } catch (error) {
                console.error('挂机模式跳过视频出错:', error);
            }
        },
        
        // 打开科目设置弹窗
        openSubjectSettings() {
            // 检查是否已有弹窗，避免重复显示
            if (document.getElementById('subjectSettingsDialog')) return;
            
            const dialog = document.createElement('div');
            dialog.id = 'subjectSettingsDialog';
            dialog.style.position = 'fixed';
            dialog.style.top = '50%';
            dialog.style.left = '50%';
            dialog.style.transform = 'translate(-50%, -50%)';
            dialog.style.backgroundColor = 'white';
            dialog.style.borderRadius = '8px';
            dialog.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2)';
            dialog.style.padding = '20px';
            dialog.style.zIndex = '10000';
            dialog.style.width = '400px';
            dialog.style.maxHeight = '70vh';
            dialog.style.overflowY = 'auto';
            
            // 获取当前跳过的科目列表
            const skipSubjects = ConfigManager.get('hangupSkipSubjects');
            
            // 构建科目复选框列表
            let subjectsHtml = '';
            Config.allSubjects.forEach(subject => {
                const isChecked = skipSubjects.includes(subject);
                subjectsHtml += `
                    <div style="display: flex; align-items: center; margin-bottom: 8px;">
                        <input type="checkbox" id="subject-${subject}" value="${subject}" ${isChecked ? 'checked' : ''} style="margin-right: 8px;">
                        <label for="subject-${subject}" style="color: #333; font-size: 14px;">${subject}</label>
                    </div>
                `;
            });
            
            dialog.innerHTML = `
                <div style="margin-bottom: 15px; color: #333; font-weight: bold; font-size: 16px;">设置跳过科目</div>
                <div style="margin-bottom: 20px; color: #666; font-size: 13px;">勾选需要在挂机模式下自动跳过的科目</div>
                <div class="subjects-container">
                    ${subjectsHtml}
                </div>
                <div style="margin-top: 20px; text-align: right;">
                    <button id="cancelSubjectSettings" style="padding: 6px 15px; background-color: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">取消</button>
                    <button id="saveSubjectSettings" style="padding: 6px 15px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">保存设置</button>
                </div>
            `;
            
            document.body.appendChild(dialog);
            
            // 添加保存按钮事件
            dialog.querySelector('#saveSubjectSettings').addEventListener('click', () => {
                const checkedSubjects = [];
                dialog.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
                    checkedSubjects.push(checkbox.value);
                });
                
                // 保存设置
                ConfigManager.update('hangupSkipSubjects', checkedSubjects);
                dialog.remove();
                
                // 显示保存成功提示
                this.showSettingsSavedMessage();
            });
            
            // 添加取消按钮事件
            dialog.querySelector('#cancelSubjectSettings').addEventListener('click', () => {
                dialog.remove();
            });
            
            // 点击外部关闭
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    dialog.remove();
                }
            });
        },
        
        // 显示设置保存成功提示
        showSettingsSavedMessage() {
            const message = document.createElement('div');
            message.style.position = 'fixed';
            message.style.bottom = '20px';
            message.style.left = '50%';
            message.style.transform = 'translateX(-50%)';
            message.style.backgroundColor = 'rgba(76, 175, 80, 0.9)';
            message.style.color = 'white';
            message.style.padding = '10px 20px';
            message.style.borderRadius = '4px';
            message.style.zIndex = '10001';
            message.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
            message.textContent = '科目设置已保存';
            
            document.body.appendChild(message);
            
            // 3秒后自动消失
            setTimeout(() => {
                message.style.opacity = '0';
                message.style.transition = 'opacity 0.5s';
                setTimeout(() => message.remove(), 500);
            }, 3000);
        },

        // 激活挂机模式
        activate() {
            // 保存当前功能状态
            const currentSettings = {
                speed: SpeedControl.currentSpeed,
                autoCheckEnabled: ConfigManager.get('autoCheckEnabled'),
                autoPlayEnabled: ConfigManager.get('autoPlayEnabled'),
                autoSkipEnabled: ConfigManager.get('autoSkipEnabled'),
                speedControlEnabled: ConfigManager.get('speedControlEnabled'),
                soundEnabled: ConfigManager.get('soundEnabled')
            };

            // 保存当前音量
            const videos = document.querySelectorAll('video');
            if (videos.length > 0) {
                this.lastVolume = videos[0].volume;
                ConfigManager.update('lastVolume', this.lastVolume);
            }

            // 存储当前设置，用于退出挂机模式时恢复
            localStorage.setItem('ewtPreHangupSettings', JSON.stringify(currentSettings));

            // 应用挂机模式设置
            SpeedControl.activateHangupMode();
            ConfigManager.update('autoCheckEnabled', true);
            ConfigManager.update('autoPlayEnabled', true);
            ConfigManager.update('autoSkipEnabled', true);
            ConfigManager.update('speedControlEnabled', false); // 倍速功能关闭
            ConfigManager.update('soundEnabled', false); // 提示音关闭

            // 更新功能状态
            AutoCheck.start();
            AutoPlay.start();
            AutoSkip.start();
            SpeedControl.disableSpeedControl(); // 禁用倍速控制，实际强制1x

            // 强制设置所有视频音量为0
            videos.forEach(video => {
                video.volume = 0;
            });

            // 启动挂机模式检查
            this.start();

            console.log('挂机模式已激活');
        },

        // 停用挂机模式，恢复之前的设置
        deactivate() {
            // 停止挂机模式检查
            this.stop();

            // 恢复之前的设置
            try {
                const preHangupSettings = JSON.parse(localStorage.getItem('ewtPreHangupSettings'));
                if (preHangupSettings) {
                    // 恢复倍速
                    SpeedControl.deactivateHangupMode();

                    // 恢复各功能开关状态
                    ConfigManager.update('autoCheckEnabled', preHangupSettings.autoCheckEnabled);
                    ConfigManager.update('autoPlayEnabled', preHangupSettings.autoPlayEnabled);
                    ConfigManager.update('autoSkipEnabled', preHangupSettings.autoSkipEnabled);
                    ConfigManager.update('speedControlEnabled', preHangupSettings.speedControlEnabled);
                    ConfigManager.update('soundEnabled', preHangupSettings.soundEnabled);

                    // 更新功能状态
                    if (preHangupSettings.autoCheckEnabled) {
                        AutoCheck.start();
                    } else {
                        AutoCheck.stop();
                    }

                    if (preHangupSettings.autoPlayEnabled) {
                        AutoPlay.start();
                    } else {
                        AutoPlay.stop();
                    }

                    if (preHangupSettings.autoSkipEnabled) {
                        AutoSkip.start();
                    } else {
                        AutoSkip.stop();
                    }

                    if (preHangupSettings.speedControlEnabled) {
                        SpeedControl.enableSpeedControl();
                    } else {
                        SpeedControl.disableSpeedControl();
                    }
                }

                // 恢复音量
                const lastVolume = ConfigManager.get('lastVolume');
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    video.volume = lastVolume;
                });
                console.log(`已恢复音量至 ${lastVolume}`);
            } catch (e) {
                console.warn('恢复挂机前设置失败:', e);
            }

            console.log('挂机模式已停用');
        },

        // 切换挂机模式状态
        toggle(isEnabled) {
            ConfigManager.update('hangupModeEnabled', isEnabled);

            if (isEnabled) {
                this.activate();
            } else {
                this.deactivate();
            }

            // 更新UI按钮状态
            const hangupButton = document.getElementById('hangupButton');
            if (hangupButton) {
                hangupButton.textContent = `挂机: ${isEnabled ? '开' : '关'}`;
                hangupButton.style.backgroundColor = isEnabled ? '#FF9800' : '#f44336';
            }

            // 更新其他按钮状态（在挂机模式下禁用修改）
            this.updateOtherButtonsState(isEnabled);
        },

        // 更新其他按钮的状态（在挂机模式下禁用）
        updateOtherButtonsState(isHangupMode) {
            const buttons = [
                document.querySelector('[textContent="过检: 开"], [textContent="过检: 关"]'),
                document.querySelector('[textContent="连播: 开"], [textContent="连播: 关"]'),
                document.querySelector('[textContent="跳题: 开"], [textContent="跳题: 关"]'),
                document.querySelector('[textContent="倍速: 开"], [textContent="倍速: 关"]'),
                document.querySelector('[textContent="提示音: 开"], [textContent="提示音: 关"]'),
                document.getElementById('speedUp'),
                document.getElementById('speedDown'),
                document.getElementById('subjectSettingsButton')
            ];

            buttons.forEach(button => {
                if (button) {
                    if (isHangupMode) {
                        button.disabled = true;
                        button.style.opacity = '0.6';
                        button.style.cursor = 'not-allowed';
                    } else {
                        button.disabled = false;
                        button.style.opacity = '1';
                        button.style.cursor = 'pointer';
                    }
                }
            });
        }
    };

    /**
     * UI模块 - 管理控制面板的创建与交互
     */
    const UI = {
        panel: null,

        createControlPanel() {
            const panel = document.createElement('div');
            panel.id = 'ewt-helper-panel';
            panel.style.position = 'fixed';
            panel.style.top = '0';
            panel.style.left = '50%';
            panel.style.transform = 'translateX(-50%)';
            panel.style.zIndex = '9999';
            panel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            panel.style.padding = '8px 15px';
            panel.style.color = 'white';
            panel.style.fontSize = '12px';
            panel.style.display = 'inline-flex';
            panel.style.alignItems = 'center';
            panel.style.gap = '15px';
            panel.style.borderRadius = '0 0 8px 8px';
            panel.style.whiteSpace = 'nowrap';
            panel.style.transition = 'all 0.3s ease';
            panel.style.opacity = Config.panelOpacity;

            panel.addEventListener('mouseenter', () => {
                panel.style.opacity = Config.panelHoverOpacity;
            });
            panel.addEventListener('mouseleave', () => {
                panel.style.opacity = Config.panelOpacity;
            });

            panel.appendChild(this.createStatsArea());
            panel.appendChild(this.createSpeedControlArea());
            panel.appendChild(this.createButtonArea());

            this.panel = panel;
            document.body.appendChild(panel);

            // 应用当前模式和倍速控制状态
            ModeControl.applyMode();
            SpeedControl.updateSpeedControlUI();

            // 检查挂机模式状态并更新按钮
            const isHangupMode = ConfigManager.get('hangupModeEnabled');
            HangupMode.updateOtherButtonsState(isHangupMode);

            return panel;
        },

        createStatsArea() {
            const statsDiv = document.createElement('div');
            statsDiv.id = 'statsArea';
            statsDiv.style.display = 'flex';
            statsDiv.style.alignItems = 'center';
            statsDiv.style.gap = '15px';
            statsDiv.innerHTML = `
                <div>累计连播: <span id="videoCount" style="color:#4CAF50">0</span></div>
                <div>累计过检: <span id="totalCheckCount" style="color:#2196F3">0</span></div>
                <div>累计跳题: <span id="skippedQuestionCount" style="color:#9C27B0">0</span></div>
                <div>时长: <span id="runTime">00:00:00</span></div>
            `;
            return statsDiv;
        },

        createSpeedControlArea() {
            const speedDiv = document.createElement('div');
            speedDiv.id = 'speedControlArea';
            speedDiv.style.display = 'flex';
            speedDiv.style.alignItems = 'center';
            speedDiv.style.padding = '0 10px';
            speedDiv.style.borderLeft = '1px solid rgba(255, 255, 255, 0.3)';

            speedDiv.innerHTML = `
                <button id="speedDown" style="margin-right:5px; padding:2px 6px; border-radius:4px; border:none; background:#555; color:white; cursor:pointer;">-</button>
                <span style="color:#FFC107">倍速:</span>
                <span id="speedDisplay" style="margin:0 5px; color:#FFEB3B">${ConfigManager.get('speed')}x</span>
                <button id="speedUp" style="margin-left:5px; padding:2px 6px; border-radius:4px; border:none; background:#555; color:white; cursor:pointer;">+</button>
            `;

            speedDiv.querySelector('#speedUp').addEventListener('click', () => {
                SpeedControl.nextSpeed();
            });
            speedDiv.querySelector('#speedDown').addEventListener('click', () => {
                SpeedControl.prevSpeed();
            });

            return speedDiv;
        },

        createButtonArea() {
            const buttonsDiv = document.createElement('div');
            buttonsDiv.style.display = 'flex';
            buttonsDiv.style.alignItems = 'center';
            buttonsDiv.style.gap = '8px';
            buttonsDiv.style.paddingLeft = '10px';
            buttonsDiv.style.borderLeft = '1px solid rgba(255, 255, 255, 0.3)';

            // 模式切换按钮
            const modeButton = this.createModeButton();
            buttonsDiv.appendChild(modeButton);

            // 科目设置按钮
            buttonsDiv.appendChild(this.createSubjectSettingsButton());

            // 挂机模式按钮
            buttonsDiv.appendChild(this.createHangupButton());

            // 倍速功能开关按钮
            buttonsDiv.appendChild(this.createFunctionButton(
                '倍速',
                ConfigManager.get('speedControlEnabled'),
                (isEnabled) => {
                    SpeedControl.toggle(isEnabled);
                    // 同步更新模式显示
                    ModeControl.applyMode();
                }
            ));

            buttonsDiv.appendChild(this.createFunctionButton(
                '过检',
                ConfigManager.get('autoCheckEnabled'),
                (isEnabled) => {
                    // 如果在挂机模式下，不允许修改
                    if (ConfigManager.get('hangupModeEnabled')) return;

                    AutoCheck.toggle(isEnabled);
                    ConfigManager.update('autoCheckEnabled', isEnabled);
                }
            ));
            buttonsDiv.appendChild(this.createFunctionButton(
                '连播',
                ConfigManager.get('autoPlayEnabled'),
                (isEnabled) => {
                    // 如果在挂机模式下，不允许修改
                    if (ConfigManager.get('hangupModeEnabled')) return;

                    AutoPlay.toggle(isEnabled);
                    ConfigManager.update('autoPlayEnabled', isEnabled);
                }
            ));
            buttonsDiv.appendChild(this.createFunctionButton(
                '跳题',
                ConfigManager.get('autoSkipEnabled'),
                (isEnabled) => {
                    // 如果在挂机模式下，不允许修改
                    if (ConfigManager.get('hangupModeEnabled')) return;

                    AutoSkip.toggle(isEnabled);
                    ConfigManager.update('autoSkipEnabled', isEnabled);
                }
            ));

            // 提示音开关按钮
            buttonsDiv.appendChild(this.createFunctionButton(
                '提示音',
                ConfigManager.get('soundEnabled'),
                (isEnabled) => {
                    // 如果在挂机模式下，不允许修改
                    if (ConfigManager.get('hangupModeEnabled')) return;

                    ConfigManager.update('soundEnabled', isEnabled);
                }
            ));

            return buttonsDiv;
        },
        
        // 创建科目设置按钮
        createSubjectSettingsButton() {
            const button = document.createElement('button');
            button.id = 'subjectSettingsButton';
            button.textContent = '科目设置';

            button.style.padding = '3px 8px';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';
            button.style.backgroundColor = '#3266FF';

            button.addEventListener('click', () => {
                HangupMode.openSubjectSettings();
            });

            return button;
        },

        // 创建挂机模式按钮
        createHangupButton() {
            const button = document.createElement('button');
            button.id = 'hangupButton';
            const isEnabled = ConfigManager.get('hangupModeEnabled');

            button.textContent = `挂机: ${isEnabled ? '开' : '关'}`;
            button.style.padding = '3px 8px';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';
            button.style.backgroundColor = isEnabled ? '#FF9800' : '#f44336';

            button.addEventListener('click', () => {
                const newState = !ConfigManager.get('hangupModeEnabled');
                HangupMode.toggle(newState);
                ConfigManager.update('hangupModeEnabled', newState);
            });

            return button;
        },

        createModeButton() {
            const button = document.createElement('button');
            button.id = 'modeToggleButton';
            button.textContent = ModeControl.currentMode === 'normal' ? '普通' : '极简';

            button.style.padding = '3px 8px';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';
            button.style.backgroundColor = '#2196F3';

            button.addEventListener('click', () => {
                ModeControl.toggleMode();
            });

            return button;
        },

        createFunctionButton(name, initialState, toggleCallback) {
            const button = document.createElement('button');
            let isEnabled = initialState;

            const updateButton = () => {
                button.textContent = `${name}: ${isEnabled ? '开' : '关'}`;
                button.style.backgroundColor = isEnabled ? '#4CAF50' : '#f44336';
            };
            updateButton();

            button.style.padding = '3px 8px';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';

            button.addEventListener('click', () => {
                isEnabled = !isEnabled;
                updateButton();
                toggleCallback(isEnabled);
            });

            return button;
        },

        removePanel() {
            if (this.panel) {
                this.panel.remove();
                this.panel = null;
            }
        }
    };

    /**
     * 自动过检模块
     */
    const AutoCheck = {
        intervalId: null,

        toggle(isEnabled) {
            if (isEnabled) {
                this.start();
            } else {
                this.stop();
            }
        },

        start() {
            if (this.intervalId) return;

            this.intervalId = setInterval(() => {
                this.checkAndClick();
            }, Config.checkInterval);
        },

        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

        checkAndClick() {
            try {
                const buttons = document.querySelectorAll('span.btn-3LStS');
                buttons.forEach(button => {
                    if (button.textContent.trim() === '点击通过检查') {
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        button.dispatchEvent(clickEvent);

                        Stats.data.totalCheckCount++;
                        Stats.updateDisplay();

                        Utils.playSound('check');
                    }
                });
            } catch (error) {
                console.error('自动过检功能出错:', error);
            }
        }
    };

    /**
     * 自动连播模块
     */
    const AutoPlay = {
        intervalId: null,

        toggle(isEnabled) {
            if (isEnabled) {
                this.start();
            } else {
                this.stop();
            }
        },

        start() {
            if (this.intervalId) return;

            this.intervalId = setInterval(() => {
                this.checkAndSwitch();
            }, Config.rewatchInterval);
        },

        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

        checkAndSwitch() {
            try {
                const progressBar = document.querySelector('.video-progress-bar');
                if (progressBar) {
                    const progress = parseFloat(progressBar.style.width) || 0;
                    if (progress < 95) return;
                }

                const rewatchElement = document.querySelector('.progress-action-ghost-1cxSL');
                const videoListContainer = document.querySelector('.listCon-N9Rlm');
                if (!rewatchElement || !videoListContainer) return;

                const activeVideo = videoListContainer.querySelector('.item-IPNWw.active-1MWMf');
                if (!activeVideo) return;

                let nextVideo = activeVideo.nextElementSibling;
                while (nextVideo) {
                    if (nextVideo.classList.contains('item-IPNWw')) {
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        nextVideo.dispatchEvent(clickEvent);

                        Stats.data.videoPlayCount++;
                        Stats.updateDisplay();

                        // 视频切换后立即更新科目信息
                        SubjectInfo.checkCurrentSubject();

                        Utils.playSound('next');
                        return;
                    }
                    nextVideo = nextVideo.nextElementSibling;
                }
            } catch (error) {
                console.error('自动连播功能出错:', error);
            }
        }
    };

    /**
     * 自动跳题模块
     */
    const AutoSkip = {
        intervalId: null,

        toggle(isEnabled) {
            if (isEnabled) {
                this.start();
            } else {
                this.stop();
            }
        },

        start() {
            if (this.intervalId) return;

            this.intervalId = setInterval(() => {
                this.checkAndSkip();
            }, Config.skipQuestionInterval);
        },

        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

        checkAndSkip() {
            try {
                const skipTexts = ['跳过', '跳题', '跳过题目', '暂不回答', '以后再说', '跳过本题'];
                let targetButton = null;

                skipTexts.some(text => {
                    const buttons = document.querySelectorAll('button, a, span.btn, div.btn');
                    for (const btn of buttons) {
                        if (btn.textContent.trim() === text) {
                            targetButton = btn;
                            return true;
                        }
                    }

                    if (!targetButton) {
                        const xpathResult = document.evaluate(
                            `//*[text()="${text}"]`,
                            document,
                            null,
                            XPathResult.FIRST_ORDERED_NODE_TYPE,
                            null
                        );
                        const element = xpathResult.singleNodeValue;
                        if (element) {
                            targetButton = element;
                            return true;
                        }
                    }
                    return false;
                });

                if (targetButton && !targetButton.dataset.skipClicked) {
                    targetButton.dataset.skipClicked = 'true';

                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    targetButton.dispatchEvent(clickEvent);

                    Stats.data.skippedQuestionCount++;
                    Stats.updateDisplay();

                    Utils.playSound('skip');

                    setTimeout(() => {
                        delete targetButton.dataset.skipClicked;
                    }, 5000);
                }
            } catch (error) {
                console.error('自动跳题功能出错:', error);
            }
        }
    };

    /**
     * 工具模块
     */
    const Utils = {
        playSound(type) {
            // 检查是否启用提示音
            if (!ConfigManager.get('soundEnabled')) return;
            
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.type = 'sine';
                switch (type) {
                    case 'check':
                        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
                        break;
                    case 'next':
                        oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
                        break;
                    case 'skip':
                        oscillator.frequency.setValueAtTime(1046, audioContext.currentTime);
                        break;
                    default:
                        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
                }
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.15);
            } catch (error) {
                console.warn('提示音播放失败:', error);
            }
        },

        isHomeworkPath() {
            return window.location.hash.startsWith(Config.targetHashPath);
        }
    };

    /**
     * 核心控制模块
     */
    const ScriptController = {
        runTimeIntervalId: null,

        start() {
            if (!Utils.isHomeworkPath()) {
                console.log('当前页面不是作业页面（路径不匹配#/homework/*），脚本未启动');
                return;
            }

            // 初始化配置
            ConfigManager.init();

            // 初始化模式控制
            ModeControl.init();
            UI.createControlPanel();

            // 初始化防干扰和倍速控制
            AntiInterference.init();
            SpeedControl.init();

            // 启动科目信息检查（内部使用，不显示）
            SubjectInfo.start();

            // 根据保存的配置状态启动各功能
            if (ConfigManager.get('autoCheckEnabled')) {
                AutoCheck.start();
            }
            if (ConfigManager.get('autoPlayEnabled')) {
                AutoPlay.start();
            }
            if (ConfigManager.get('autoSkipEnabled')) {
                AutoSkip.start();
            }

            // 如果挂机模式是开启状态，则激活挂机模式
            if (ConfigManager.get('hangupModeEnabled')) {
                HangupMode.activate();
            } else {
                HangupMode.stop();
            }

            this.runTimeIntervalId = setInterval(() => {
                Stats.updateRunTime();
            }, 1000);

            console.log('升学E网通助手（增强版）已启动');
        },

        stop() {
            AutoCheck.stop();
            AutoPlay.stop();
            AutoSkip.stop();
            SubjectInfo.stop();
            HangupMode.stop(); // 停止挂机模式

            // 停止倍速自动重应用并恢复原始控制
            SpeedControl.disableSpeedControl();

            if (this.runTimeIntervalId) {
                clearInterval(this.runTimeIntervalId);
                this.runTimeIntervalId = null;
            }

            UI.removePanel();

            console.log('升学E网通助手（增强版）已停止');
        },

        watchHashChange() {
            window.addEventListener('hashchange', () => {
                const isHomework = Utils.isHomeworkPath();
                const isRunning = !!this.runTimeIntervalId;

                if (isHomework && !isRunning) {
                    this.start();
                } else if (!isHomework && isRunning) {
                    this.stop();
                }
            });
        }
    };

    // 初始化脚本
    ScriptController.start();
    ScriptController.watchHashChange();

    window.addEventListener('beforeunload', () => {
        ScriptController.stop();
    });

})();
// Ciallo～(∠・ω< )⌒★
