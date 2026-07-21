// ==================== 背景音乐管理 ====================
class MusicPlayer {
    constructor() {
        this.audio = new Audio();
        this.audio.loop = true;
        this.audio.volume = 0.3;
        this.currentTrack = 0;
        this.isPlaying = false;
        this.tracks = [];
        
        this.init();
    }

    async init() {
        await this.scanMusic();
        
        if (this.tracks.length > 0) {
            this.loadTrack(0);
        }
        
        this.bindEvents();
    }

    async scanMusic() {
        try {
            const response = await fetch('./music_list.json');
            if (response.ok) {
                const list = await response.json();
                this.tracks = list.map(name => ({
                    name: name.replace(/\.[^.]+$/, ''),
                    path: './music/' + name
                }));
                console.log(`✅ 从列表加载了 ${this.tracks.length} 首音乐`);
                this.renderMusicList();
                return;
            }
        } catch(e) {
            console.log('音乐列表文件读取失败');
        }
        
        try {
            const response = await fetch('./music/');
            if (response.ok) {
                const text = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');
                const links = doc.querySelectorAll('a');
                
                const musicExts = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];
                links.forEach(link => {
                    const href = link.getAttribute('href') || '';
                    const lower = href.toLowerCase();
                    if (musicExts.some(e => lower.endsWith('.' + e)) && !href.startsWith('.')) {
                        this.tracks.push({
                            name: decodeURIComponent(href.replace(/\.[^.]+$/, '')),
                            path: './music/' + href
                        });
                    }
                });
            }
        } catch(e) {
            console.log('音乐目录扫描失败');
        }
        
        if (this.tracks.length === 0) {
            this.tracks = [];
            console.log('⚠️ 未找到音乐文件，音乐功能将不可用');
        }
        
        this.renderMusicList();
    }

    loadTrack(index) {
        if (index >= 0 && index < this.tracks.length) {
            this.currentTrack = index;
            this.audio.src = this.tracks[index].path;
            const icon = document.getElementById('musicToggleBtn').querySelector('.music-icon');
            if (icon) {
                icon.textContent = '🎵 ' + this.tracks[index].name.substring(0, 8);
            }
        }
    }

    toggle() {
        if (this.isPlaying) {
            this.audio.pause();
            document.getElementById('musicToggleBtn').classList.remove('playing');
        } else {
            this.audio.play().catch(() => {});
            document.getElementById('musicToggleBtn').classList.add('playing');
        }
        this.isPlaying = !this.isPlaying;
    }

    setVolume(value) {
        this.audio.volume = value / 100;
    }

    renderMusicList() {
        const list = document.getElementById('musicList');
        if (!list) return;
        
        list.innerHTML = this.tracks.map((track, index) => `
            <div class="music-item ${index === this.currentTrack ? 'active' : ''}" 
                 data-index="${index}"
                 onclick="window.viewer.musicPlayer.selectTrack(${index})">
                <span class="music-item-icon">${index === this.currentTrack ? '🔊' : '🎵'}</span>
                <span class="music-item-name">${track.name}</span>
            </div>
        `).join('');
    }

    selectTrack(index) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.audio.pause();
        
        this.loadTrack(index);
        this.renderMusicList();
        
        if (wasPlaying) {
            this.audio.play().catch(() => {});
        }
        
        document.getElementById('musicModal').classList.remove('active');
    }

    bindEvents() {
        document.getElementById('musicToggleBtn').addEventListener('click', () => this.toggle());
        document.getElementById('musicSelectBtn').addEventListener('click', () => {
            document.getElementById('musicModal').classList.add('active');
        });
        document.getElementById('musicModalClose').addEventListener('click', () => {
            document.getElementById('musicModal').classList.remove('active');
        });
        document.getElementById('volumeSlider').addEventListener('input', (e) => {
            this.setVolume(e.target.value);
        });
        
        document.getElementById('musicModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                e.currentTarget.classList.remove('active');
            }
        });
    }
}

// ==================== 图片浏览器 ====================
class ImageViewer {
    constructor() {
        this.currentIndex = 0;
        this.images = [];
        this.thumbImages = [];
        this.loadedCount = 0;
        this.loadedImages = new Set();
        this.isAutoPlaying = false;
        this.autoPlayInterval = null;
        this.autoPlayDelay = 3000;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchEndX = 0;
        this.touchEndY = 0;
        this.isSwiping = false;
        this.swipeThreshold = 50;
        this.backgroundImage = '';
        this.imageFolder = 'images';
        this.thumbFolder = 'images_thumb';
        this.albumTitle = '婚纱照';
        this.scale = 1;
        this.lastTapTime = 0;
        this.longPressTimer = null;
        this.musicPlayer = null;
        this.animationType = 'slide';
        this.animationTypes = ['slide', 'fade', 'zoom', 'flip'];

        this.getURLParams();
        this.detectDeviceAndSetBackground();
        this.init();
    }

    getURLParams() {
        const params = new URLSearchParams(window.location.search);
        this.imageFolder = params.get('imageFolder') || 'images';
        this.thumbFolder = params.get('thumbFolder') || 'images_thumb';
        this.albumTitle = params.get('title') || '婚纱照';
        
        document.getElementById('pageTitle').textContent = this.albumTitle;
        document.getElementById('viewerTitle').textContent = this.albumTitle;
    }

    detectDeviceAndSetBackground() {
        const width = window.innerWidth;
        const userAgent = navigator.userAgent.toLowerCase();
        
        const isMobile = /mobile|android|iphone|ipod/.test(userAgent);
        const isTablet = /ipad|android(?!.*mobile)|tablet/.test(userAgent) || 
                        (width >= 768 && width < 1024 && ('ontouchstart' in window));
    }

    async init() {
        this.showLoading();
        
        this.musicPlayer = new MusicPlayer();
        
        await this.loadImages();

        if (this.images.length === 0) {
            this.showError();
            return;
        }

        console.log(`✅ 成功加载 ${this.images.length} 张图片`);
        
        this.render();
        this.bindEvents();
        this.goToSlide(0);
        this.preloadAllThumbnails();
        
        setTimeout(() => {
            const hint = document.getElementById('hintText');
            if (hint) hint.style.opacity = '0';
        }, 5000);

        setTimeout(() => {
            const progressBar = document.getElementById('progressBarContainer');
            if (progressBar) {
                progressBar.style.opacity = '0';
                setTimeout(() => progressBar.remove(), 500);
            }
        }, 1500);
    }

    showLoading() {
        const viewer = document.getElementById('viewer');
        viewer.innerHTML = `
            <div style="
                color: white;
                text-align: center;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
            ">
                <div class="spinner" style="
                    width: 40px; height: 40px;
                    border: 3px solid rgba(255,255,255,0.2);
                    border-top-color: #fff;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                    margin: 0 auto 20px;
                "></div>
                <div>正在加载 ${this.albumTitle}...</div>
            </div>
        `;
    }

    // ========== 核心修复：加载图片 ==========
    async loadImages() {
        // 1. 从缩略图文件夹加载所有缩略图
        const thumbImages = await this.loadFromDirectory(this.thumbFolder);
        
        if (thumbImages.length === 0) {
            // 如果缩略图文件夹为空，尝试从原图文件夹加载
            const originalImages = await this.loadFromDirectory(this.imageFolder);
            this.images = originalImages;
            this.thumbImages = originalImages;
        } else {
            // 2. 保存缩略图路径
            this.thumbImages = thumbImages;
            
            // 3. 从缩略图路径推导原图路径（修复：正确替换文件夹名）
            this.images = thumbImages.map(thumbPath => {
                // 获取文件夹名称（去掉 ./ 前缀和末尾的 /）
                let thumbFolderName = this.thumbFolder.replace(/^\.\//, '').replace(/\/$/, '');
                let imageFolderName = this.imageFolder.replace(/^\.\//, '').replace(/\/$/, '');
                
                // 替换路径中的文件夹名
                // 例如: ./images2_thumb/1.webp -> ./images2/1.webp
                let fullPath = thumbPath.replace(thumbFolderName, imageFolderName);
                
                // 如果替换后路径没有变化，尝试用正则替换
                if (fullPath === thumbPath) {
                    // 使用正则替换：匹配文件夹名（包含下划线等）
                    const regex = new RegExp(thumbFolderName.replace(/_/g, '[_]?'), 'g');
                    fullPath = thumbPath.replace(regex, imageFolderName);
                }
                
                return fullPath;
            });
            
            console.log('📁 缩略图文件夹:', this.thumbFolder);
            console.log('📁 原图文件夹:', this.imageFolder);
            console.log('🖼️ 缩略图路径示例:', this.thumbImages[0]);
            console.log('🖼️ 原图路径示例:', this.images[0]);
        }

        this.updateProgress(100);
    }

    async loadFromDirectory(folder) {
        // 方法1：读取列表JSON文件
        const listFile = folder.replace(/^\.\//, '').replace(/\/$/, '') + '_list.json';
        
        try {
            const response = await fetch('./' + listFile);
            if (response.ok) {
                const fileList = await response.json();
                console.log(`✅ 从 ${listFile} 加载了 ${fileList.length} 张图片`);
                const images = fileList.map(f => `./${folder}/${f}`);
                return this.sortImages(images);
            }
        } catch(e) {
            console.log('列表文件读取失败，尝试目录扫描...');
        }

        // 方法2：目录扫描
        try {
            const response = await fetch(`./${folder}/`);
            if (!response.ok) return [];

            const text = await response.text();
            if (!text.includes('<a') && !text.includes('<A')) return [];

            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const links = doc.querySelectorAll('a');

            const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'];
            const images = [];
            
            links.forEach(link => {
                const href = link.getAttribute('href') || '';
                if (href && !href.startsWith('.') && !href.startsWith('/') && !href.startsWith('?')) {
                    const lower = href.toLowerCase();
                    if (imageExts.some(ext => lower.endsWith('.' + ext))) {
                        images.push(`./${folder}/${decodeURIComponent(href)}`);
                    }
                }
            });

            return this.sortImages(images);
        } catch(e) {
            console.log('目录扫描失败:', e.message);
            return [];
        }
    }

    sortImages(images) {
        return images.sort((a, b) => {
            const nameA = a.split('/').pop();
            const nameB = b.split('/').pop();
            const numA = parseInt(nameA);
            const numB = parseInt(nameB);
            
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            if (!isNaN(numA)) return -1;
            if (!isNaN(numB)) return 1;
            return nameA.localeCompare(nameB, 'zh-CN', { numeric: true });
        });
    }

    preloadAllThumbnails() {
        let loaded = 0;
        const total = this.images.length;

        this.images.forEach((src, index) => {
            const img = new Image();
            img.onload = () => {
                loaded++;
                this.updateProgress(Math.round((loaded / total) * 100));
                this.loadedImages.add(index);
            };
            img.onerror = () => {
                loaded++;
                this.updateProgress(Math.round((loaded / total) * 100));
            };
            // 预加载缩略图
            img.src = this.thumbImages[index] || src;
        });
    }

    updateProgress(percent) {
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        if (progressBar) progressBar.style.width = percent + '%';
        if (progressText) progressText.textContent = percent + '%';
    }

    render() {
        const viewer = document.getElementById('viewer');
        viewer.innerHTML = `
            <div class="slides-container" id="slidesContainer"></div>
            <button class="nav-btn prev-btn" id="prevBtn" aria-label="上一张">‹</button>
            <button class="nav-btn next-btn" id="nextBtn" aria-label="下一张">›</button>
            <div class="top-bar">
                <span class="image-name" id="imageName"></span>
                <span class="counter" id="counter">0 / ${this.images.length}</span>
            </div>
            <div class="slide-indicators" id="slideIndicators"></div>
            <div class="thumbnail-bar" id="thumbnailBar">
                <div class="thumbnail-header">
                    <span class="thumbnail-title" id="thumbnailTitle">${this.albumTitle} (${this.images.length}张)</span>
                    <button class="thumbnail-close" id="thumbnailClose">✕</button>
                </div>
                <div class="thumbnail-container" id="thumbnailContainer"></div>
            </div>
            <div class="bottom-controls" id="bottomControls">
                <button class="control-btn" id="toggleThumbnails">
                    <span>🖼</span> 缩略图
                </button>
                <button class="control-btn" id="autoPlayBtn">
                    <span>▶</span> 自动播放
                </button>
            </div>
            <div class="hint-text" id="hintText">← 左右滑动切换图片 →</div>
        `;

        // 渲染幻灯片
        const slidesContainer = document.getElementById('slidesContainer');
        const slideFragment = document.createDocumentFragment();

        this.images.forEach((src, index) => {
            const slide = document.createElement('div');
            slide.className = 'slide';
            slide.setAttribute('data-index', index);

            const bgDiv = document.createElement('div');
            bgDiv.className = 'slide-bg';
            bgDiv.style.backgroundImage = this.backgroundImage;
            slide.appendChild(bgDiv);

            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading-indicator';
            loadingDiv.innerHTML = `<div class="spinner"></div>`;
            slide.appendChild(loadingDiv);

            const imgContainer = document.createElement('div');
            imgContainer.className = 'img-container';
            
            const img = document.createElement('img');
            // 先加载缩略图（小图）
            img.src = this.thumbImages[index] || src;
            img.alt = `图片 ${index + 1}`;
            img.setAttribute('data-full-src', src);
            
            img.onload = () => {
                img.classList.add('loaded');
                loadingDiv.style.opacity = '0';
                setTimeout(() => loadingDiv.remove(), 400);
                
                // 延迟加载原图（大图）
                if (img.src !== src) {
                    setTimeout(() => {
                        const fullImg = new Image();
                        fullImg.onload = () => {
                            img.src = src;
                            console.log(`✅ 加载原图: ${src}`);
                        };
                        fullImg.onerror = () => {
                            // 如果原图加载失败，保持缩略图
                            console.warn(`⚠️ 原图加载失败，使用缩略图: ${src}`);
                        };
                        fullImg.src = src;
                    }, 500);
                }
            };

            img.onerror = () => {
                loadingDiv.innerHTML = '<div style="color:white;font-size:40px;">⚠️</div>';
            };

            imgContainer.appendChild(img);
            slide.appendChild(imgContainer);
            slideFragment.appendChild(slide);
        });

        slidesContainer.appendChild(slideFragment);

        this.renderThumbnails();
        this.renderIndicators();
    }

    renderThumbnails() {
        const container = document.getElementById('thumbnailContainer');
        if (!container) return;
        
        const fragment = document.createDocumentFragment();
        
        this.images.forEach((src, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'thumbnail';
            thumb.setAttribute('data-index', index);
            
            const thumbImg = document.createElement('img');
            // 缩略图使用缩略图路径
            thumbImg.src = this.thumbImages[index] || src;
            thumbImg.loading = 'lazy';
            
            thumb.appendChild(thumbImg);
            fragment.appendChild(thumb);
        });
        
        container.innerHTML = '';
        container.appendChild(fragment);
    }

    renderIndicators() {
        const container = document.getElementById('slideIndicators');
        if (!container) return;
        
        container.innerHTML = '';
        
        const maxDots = 20;
        const total = this.images.length;
        
        if (total <= maxDots) {
            for (let i = 0; i < total; i++) {
                const dot = document.createElement('div');
                dot.className = 'indicator-dot';
                dot.setAttribute('data-index', i);
                dot.addEventListener('click', () => this.goToSlide(i));
                container.appendChild(dot);
            }
        } else {
            const dot = document.createElement('div');
            dot.className = 'indicator-dot';
            container.appendChild(dot);
        }
    }

    getFileName(path) {
        try {
            return decodeURIComponent(path.split('/').pop());
        } catch(e) {
            return path.split('/').pop();
        }
    }

    // ==================== 事件绑定 ====================
    bindEvents() {
        document.getElementById('backBtn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        document.getElementById('prevBtn').addEventListener('click', () => this.prevSlide());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextSlide());
        document.getElementById('toggleThumbnails').addEventListener('click', () => this.toggleThumbnails());
        document.getElementById('thumbnailClose').addEventListener('click', () => this.hideThumbnails());
        document.getElementById('autoPlayBtn').addEventListener('click', () => this.toggleAutoPlay());

        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowLeft': e.preventDefault(); this.prevSlide(); break;
                case 'ArrowRight': e.preventDefault(); this.nextSlide(); break;
                case 'Escape': this.hideThumbnails(); break;
                case ' ': e.preventDefault(); this.toggleAutoPlay(); break;
                case 'Home': e.preventDefault(); this.goToSlide(0); break;
                case 'End': e.preventDefault(); this.goToSlide(this.images.length - 1); break;
                case 'f': this.toggleFullscreen(); break;
                case 'm': this.musicPlayer?.toggle(); break;
                case 'a': this.cycleAnimation(); break;
            }
        });

        const viewer = document.getElementById('viewer');

        viewer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        viewer.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        viewer.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        let isDragging = false, startX = 0, startY = 0;
        
        viewer.addEventListener('mousedown', (e) => {
            if (e.target.closest('button') || e.target.closest('.thumbnail')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            viewer.style.cursor = 'grabbing';
            
            this.longPressTimer = setTimeout(() => this.showContextMenu(e), 800);
        });

        viewer.addEventListener('mouseup', (e) => {
            clearTimeout(this.longPressTimer);
            if (!isDragging) return;
            isDragging = false;
            viewer.style.cursor = 'default';
            
            const diffX = e.clientX - startX;
            const diffY = e.clientY - startY;
            
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > this.swipeThreshold) {
                if (diffX > 0) this.prevSlide();
                else this.nextSlide();
            }
        });

        viewer.addEventListener('mouseleave', () => {
            clearTimeout(this.longPressTimer);
            if (isDragging) {
                isDragging = false;
                viewer.style.cursor = 'default';
            }
        });

        document.getElementById('thumbnailContainer')?.addEventListener('click', (e) => {
            const thumb = e.target.closest('.thumbnail');
            if (thumb) {
                this.goToSlide(parseInt(thumb.getAttribute('data-index')));
            }
        });

        viewer.addEventListener('wheel', (e) => {
            if (e.target.closest('.thumbnail-container') || e.target.closest('.music-modal')) return;
            if (e.ctrlKey) {
                e.preventDefault();
                if (e.deltaY > 0) this.scale = Math.max(1, this.scale - 0.1);
                else this.scale = Math.min(3, this.scale + 0.1);
                this.applyScale();
                return;
            }
            e.preventDefault();
            if (Math.abs(e.deltaX) > 10 || Math.abs(e.deltaY) > 30) {
                if (e.deltaX > 0 || e.deltaY > 0) this.nextSlide();
                else this.prevSlide();
            }
        }, { passive: false });

        viewer.addEventListener('dblclick', (e) => {
            if (e.target.closest('button') || e.target.closest('.thumbnail')) return;
            this.cycleAnimation();
        });

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.detectDeviceAndSetBackground();
                this.updateBackgrounds();
            }, 500);
        });

        document.addEventListener('click', () => {
            document.getElementById('contextMenu')?.classList.remove('active');
        });

        document.getElementById('contextMenu')?.addEventListener('click', (e) => {
            const action = e.target.closest('.context-menu-item')?.getAttribute('data-action');
            switch(action) {
                case 'save': this.saveCurrentImage(); break;
                case 'share': this.shareCurrentImage(); break;
                case 'info': this.showImageInfo(); break;
            }
            document.getElementById('contextMenu').classList.remove('active');
        });
    }

    handleTouchStart(e) {
        if (e.target.closest('button') || e.target.closest('.thumbnail') || 
            e.target.closest('.music-modal') || e.target.closest('input')) return;
        
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.isSwiping = true;
        
        if (e.touches.length === 2) {
            this.initialPinchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
        
        this.longPressTimer = setTimeout(() => this.showContextMenu(e.touches[0]), 800);
    }

    handleTouchMove(e) {
        if (!this.isSwiping) return;
        
        this.touchEndX = e.touches[0].clientX;
        this.touchEndY = e.touches[0].clientY;
        
        if (e.touches.length === 2 && this.initialPinchDistance) {
            e.preventDefault();
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const scaleChange = currentDistance / this.initialPinchDistance;
            this.scale = Math.max(1, Math.min(3, scaleChange));
            this.applyScale();
        }
    }

    handleTouchEnd() {
        clearTimeout(this.longPressTimer);
        if (!this.isSwiping) return;
        this.handleSwipe();
        this.isSwiping = false;
        this.initialPinchDistance = null;
        
        const now = Date.now();
        if (now - this.lastTapTime < 300) {
            this.cycleAnimation();
        }
        this.lastTapTime = now;
    }

    handleSwipe() {
        const diffX = this.touchEndX - this.touchStartX;
        const diffY = this.touchEndY - this.touchStartY;

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > this.swipeThreshold) {
            if (diffX > 0) this.prevSlide();
            else this.nextSlide();
        }
    }

    // ==================== 图片切换 ====================
    goToSlide(index) {
        if (index < 0 || index >= this.images.length) return;

        this.currentIndex = index;
        
        const slidesContainer = document.getElementById('slidesContainer');
        const currentSlide = slidesContainer?.children[index];
        
        if (!slidesContainer || !currentSlide) return;

        switch(this.animationType) {
            case 'fade':
                this.fadeTransition(slidesContainer, currentSlide, index);
                break;
            case 'zoom':
                this.zoomTransition(slidesContainer, currentSlide, index);
                break;
            case 'flip':
                this.flipTransition(slidesContainer, currentSlide, index);
                break;
            default:
                this.slideTransition(slidesContainer, index);
        }

        this.updateUI();
        this.preloadAdjacentImages(index);
    }

    slideTransition(container, index) {
        container.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        container.style.transform = `translateX(-${index * 100}%)`;
    }

    fadeTransition(container, currentSlide, index) {
        container.style.transition = 'none';
        container.style.transform = `translateX(-${index * 100}%)`;
        
        const img = currentSlide.querySelector('img');
        if (img) {
            img.style.opacity = '0';
            img.style.transform = 'scale(0.9)';
            requestAnimationFrame(() => {
                img.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                img.style.opacity = '1';
                img.style.transform = 'scale(1)';
            });
        }
    }

    zoomTransition(container, currentSlide, index) {
        container.style.transition = 'none';
        container.style.transform = `translateX(-${index * 100}%)`;
        
        const img = currentSlide.querySelector('img');
        if (img) {
            img.style.opacity = '0';
            img.style.transform = 'scale(0.3)';
            requestAnimationFrame(() => {
                img.style.transition = 'opacity 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
                img.style.opacity = '1';
                img.style.transform = 'scale(1)';
            });
        }
    }

    flipTransition(container, currentSlide, index) {
        container.style.transition = 'none';
        container.style.transform = `translateX(-${index * 100}%)`;
        
        const img = currentSlide.querySelector('img');
        if (img) {
            img.style.opacity = '0';
            img.style.transform = 'rotateY(90deg)';
            requestAnimationFrame(() => {
                img.style.transition = 'opacity 0.4s ease, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                img.style.opacity = '1';
                img.style.transform = 'rotateY(0deg)';
            });
        }
    }

    cycleAnimation() {
        const currentIdx = this.animationTypes.indexOf(this.animationType);
        const nextIdx = (currentIdx + 1) % this.animationTypes.length;
        this.animationType = this.animationTypes[nextIdx];
        
        const names = { slide: '滑动', fade: '淡入', zoom: '缩放', flip: '翻转' };
        this.showToast('切换效果：' + names[this.animationType]);
    }

    nextSlide() {
        if (this.currentIndex < this.images.length - 1) {
            this.goToSlide(this.currentIndex + 1);
        } else {
            this.goToSlide(0);
        }
    }

    prevSlide() {
        if (this.currentIndex > 0) {
            this.goToSlide(this.currentIndex - 1);
        } else {
            this.goToSlide(this.images.length - 1);
        }
    }

    // ==================== UI更新 ====================
    updateUI() {
        this.updateCounter();
        this.updateImageName();
        this.updateIndicators();
        this.updateThumbnails();
        
        this.scale = 1;
        this.applyScale();
    }

    updateCounter() {
        const counter = document.getElementById('counter');
        if (counter) counter.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
    }

    updateImageName() {
        const imageName = document.getElementById('imageName');
        if (imageName && this.images[this.currentIndex]) {
            imageName.textContent = this.getFileName(this.images[this.currentIndex]);
        }
    }

    updateIndicators() {
        const dots = document.querySelectorAll('.indicator-dot');
        if (dots.length <= 1) return;
        
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === this.currentIndex);
        });
    }

    updateThumbnails() {
        const thumbs = document.querySelectorAll('.thumbnail');
        thumbs.forEach((thumb, index) => {
            thumb.classList.toggle('active', index === this.currentIndex);
        });

        const activeThumb = document.querySelector('.thumbnail.active');
        if (activeThumb) {
            setTimeout(() => {
                activeThumb.scrollIntoView({
                    behavior: 'smooth', block: 'nearest', inline: 'center'
                });
            }, 100);
        }
    }

    updateBackgrounds() {
        document.querySelectorAll('.slide-bg').forEach(bg => {
            bg.style.backgroundImage = this.backgroundImage;
        });
    }

    applyScale() {
        const currentSlide = document.querySelector(`.slide[data-index="${this.currentIndex}"]`);
        if (currentSlide) {
            const img = currentSlide.querySelector('img');
            if (img) {
                img.style.transform = `scale(${this.scale})`;
                img.style.transition = 'transform 0.3s ease';
            }
        }
    }

    // ==================== 缩略图 ====================
    toggleThumbnails() {
        const bar = document.getElementById('thumbnailBar');
        const controls = document.getElementById('bottomControls');
        if (!bar || !controls) return;
        
        if (bar.classList.contains('active')) {
            this.hideThumbnails();
        } else {
            bar.classList.add('active');
            controls.classList.add('shifted');
            this.updateThumbnails();
        }
    }

    hideThumbnails() {
        document.getElementById('thumbnailBar')?.classList.remove('active');
        document.getElementById('bottomControls')?.classList.remove('shifted');
    }

    // ==================== 自动播放 ====================
    toggleAutoPlay() {
        const btn = document.getElementById('autoPlayBtn');
        if (!btn) return;
        
        if (this.isAutoPlaying) {
            clearInterval(this.autoPlayInterval);
            btn.innerHTML = '<span>▶</span> 自动播放';
            this.isAutoPlaying = false;
        } else {
            this.autoPlayInterval = setInterval(() => this.nextSlide(), this.autoPlayDelay);
            btn.innerHTML = '<span>⏸</span> 停止播放';
            this.isAutoPlaying = true;
        }
    }

    // ==================== 图片操作 ====================
    showContextMenu(e) {
        const menu = document.getElementById('contextMenu');
        if (!menu) return;
        
        const x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        const y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        
        menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
        menu.style.top = Math.min(y, window.innerHeight - 150) + 'px';
        menu.classList.add('active');
    }

    async saveCurrentImage() {
        try {
            const src = this.images[this.currentIndex];
            const response = await fetch(src);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.getFileName(src);
            a.click();
            URL.revokeObjectURL(url);
            this.showToast('图片已保存');
        } catch(e) {
            this.showToast('保存失败');
        }
    }

    shareCurrentImage() {
        if (navigator.share) {
            navigator.share({
                title: this.albumTitle,
                text: '看看我们的' + this.albumTitle,
                url: window.location.href
            }).catch(() => {});
        } else {
            navigator.clipboard.writeText(window.location.href)
                .then(() => this.showToast('链接已复制'))
                .catch(() => this.showToast('分享失败'));
        }
    }

    showImageInfo() {
        const src = this.images[this.currentIndex];
        const fileName = this.getFileName(src);
        const img = new Image();
        img.onload = () => {
            this.showToast(`${fileName}\n尺寸: ${img.width}×${img.height}\n位置: ${this.currentIndex + 1}/${this.images.length}`);
        };
        img.src = src;
    }

    showToast(message) {
        document.querySelectorAll('.toast').forEach(t => t.remove());
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            font-size: 13px;
            z-index: 1000;
            backdrop-filter: blur(10px);
            animation: toastIn 0.3s ease;
            white-space: pre-line;
            text-align: center;
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    // ==================== 其他 ====================
    preloadAdjacentImages(index) {
        const indices = [index - 2, index - 1, index, index + 1, index + 2]
            .filter(i => i >= 0 && i < this.images.length && !this.loadedImages.has(i));

        indices.forEach(i => {
            const img = new Image();
            img.onload = () => this.loadedImages.add(i);
            img.src = this.images[i];
        });
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    }

    showError() {
        const viewer = document.getElementById('viewer');
        viewer.innerHTML = `
            <div style="color:white;text-align:center;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);max-width:500px;">
                <div style="font-size:60px;margin-bottom:20px;">📁</div>
                <div style="font-size:18px;margin-bottom:20px;">
                    未找到 ${this.albumTitle} 图片<br>
                    <span style="font-size:14px;color:#999;">请确保 ${this.thumbFolder} 文件夹中有图片</span>
                </div>
                <button onclick="window.location.href='index.html'" 
                    style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.3);padding:12px 30px;border-radius:50px;font-size:16px;cursor:pointer;">
                    ← 返回选择
                </button>
            </div>
        `;
    }
}

// ==================== 初始化 ====================
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

const toastStyle = document.createElement('style');
toastStyle.textContent = `
    @keyframes toastIn {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
`;
document.head.appendChild(toastStyle);

document.addEventListener('DOMContentLoaded', () => {
    window.viewer = new ImageViewer();
});