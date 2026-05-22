class ImageViewer {
    constructor() {
        this.currentIndex = 0;
        this.images = [];
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
        this.preloadedImages = new Map();
        this.folder = 'images'; // 默认文件夹
        this.albumTitle = '婚纱照'; // 默认标题
        this.imageExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp',
            'svg', 'ico', 'tiff', 'tif', 'avif', 'heic',
            'heif', 'jfif', 'pjpeg', 'pjp'
        ];

        this.getURLParams();
        this.detectDeviceAndSetBackground();
        this.init();
    }

    // 获取URL参数
    getURLParams() {
        const params = new URLSearchParams(window.location.search);
        this.folder = params.get('folder') || 'images';
        this.albumTitle = params.get('title') || '婚纱照';
        
        // 更新页面标题
        document.getElementById('pageTitle').textContent = this.albumTitle;
        document.getElementById('viewerTitle').textContent = this.albumTitle;
    }

    detectDeviceAndSetBackground() {
        const width = window.innerWidth;
        const userAgent = navigator.userAgent.toLowerCase();
        
        const isMobile = /mobile|android|iphone|ipod|blackberry|iemobile|opera mini/.test(userAgent);
        const isTablet = /ipad|android(?!.*mobile)|tablet/.test(userAgent) || 
                        (width >= 768 && width < 1024 && ('ontouchstart' in window));
        const isDesktop = !isMobile && !isTablet;

        if (isDesktop) {
            this.backgroundImage = 'url("./bg1.png")';
        } else if (isTablet) {
            this.backgroundImage = 'url("./bg2.png")';
        } else {
            this.backgroundImage = 'url("./bg3.png")';
        }
    }

    async init() {
        this.showLoading();
        
        await this.loadImages();

        if (this.images.length === 0) {
            this.showError();
            return;
        }

        console.log(`✅ 成功加载 ${this.folder} 中的 ${this.images.length} 张图片`);
        
        this.render();
        this.bindEvents();
        this.goToSlide(0);
        this.preloadAdjacentImages(0);
        
        setTimeout(() => {
            const hint = document.getElementById('hintText');
            if (hint) hint.style.opacity = '0';
        }, 5000);
    }

    showLoading() {
        const viewer = document.querySelector('.viewer');
        viewer.innerHTML = `
            <div style="
                color: white;
                text-align: center;
                padding: 40px 20px;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 100%;
            ">
                <div class="spinner" style="
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255,255,255,0.2);
                    border-top-color: #fff;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                    margin: 0 auto 20px;
                "></div>
                <div style="font-size: 16px; color: #999;">
                    正在扫描 ${this.albumTitle}...
                </div>
            </div>
            <style>
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
    }

    async loadImages() {
        console.log(`🔍 开始扫描 ${this.folder} 文件夹...`);
        
        let images = await this.loadFromDirectoryListing();
        if (images.length > 0) {
            console.log('✅ 通过目录列表加载成功');
            this.images = images;
            return;
        }

        console.log('🔄 使用主动探测模式...');
        images = await this.probeImages();
        if (images.length > 0) {
            console.log('✅ 通过主动探测加载成功');
            this.images = images;
            return;
        }

        images = await this.loadFromManualList();
        if (images.length > 0) {
            console.log('✅ 通过手动列表加载成功');
            this.images = images;
            return;
        }

        console.error('❌ 所有加载方法都失败了');
    }

    async loadFromDirectoryListing() {
        try {
            const response = await fetch(`./${this.folder}/`);
            if (!response.ok) return [];

            const text = await response.text();
            
            if (!text.includes('<a') && !text.includes('<A')) {
                return [];
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const links = doc.querySelectorAll('a');

            const images = [];
            links.forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('.') && !href.startsWith('/') && !href.startsWith('?')) {
                    const lowerHref = href.toLowerCase();
                    const isImage = this.imageExtensions.some(ext => lowerHref.endsWith('.' + ext));
                    if (isImage) {
                        const decodedHref = decodeURIComponent(href);
                        images.push(`./${this.folder}/` + decodedHref);
                    }
                }
            });

            return this.sortImages(images);
        } catch (e) {
            console.log('目录列表获取失败:', e.message);
            return [];
        }
    }

    async probeImages() {
        const foundImages = [];
        const probePromises = [];

        // 探测数字序列 1-200
        for (let i = 1; i <= 200; i++) {
            for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']) {
                const path = `./${this.folder}/${i}.${ext}`;
                probePromises.push(
                    this.checkFile(path).then(exists => {
                        if (exists) {
                            foundImages.push({ path, num: i });
                        }
                    })
                );
            }
        }

        // 探测常见名称
        const commonNames = [
            'cover', 'banner', 'logo', 'avatar', 'icon', 'thumb',
            'bg', 'background', 'photo', 'image', 'pic', 'img',
            'wallpaper', 'screenshot', 'screen', 'sample', 'test'
        ];

        for (const name of commonNames) {
            for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif']) {
                const path = `./${this.folder}/${name}.${ext}`;
                probePromises.push(
                    this.checkFile(path).then(exists => {
                        if (exists && !foundImages.find(f => f.path === path)) {
                            foundImages.push({ path, num: Infinity });
                        }
                    })
                );
            }
        }

        await Promise.race([
            Promise.all(probePromises),
            new Promise(resolve => setTimeout(resolve, 5000))
        ]);

        const uniqueImages = [];
        const seen = new Set();
        foundImages.forEach(img => {
            if (!seen.has(img.path)) {
                seen.add(img.path);
                uniqueImages.push(img);
            }
        });

        uniqueImages.sort((a, b) => {
            if (a.num !== b.num) return a.num - b.num;
            return a.path.localeCompare(b.path);
        });

        return uniqueImages.map(img => img.path);
    }

    async loadFromManualList() {
        const images = [];
        const checks = [];
        
        for (let i = 1; i <= 200; i++) {
            checks.push(
                this.checkFile(`./${this.folder}/${i}.png`).then(exists => {
                    if (exists) images.push({ path: `./${this.folder}/${i}.png`, num: i });
                }),
                this.checkFile(`./${this.folder}/${i}.jpg`).then(exists => {
                    if (exists) images.push({ path: `./${this.folder}/${i}.jpg`, num: i });
                }),
                this.checkFile(`./${this.folder}/${i}.jpeg`).then(exists => {
                    if (exists) images.push({ path: `./${this.folder}/${i}.jpeg`, num: i });
                }),
                this.checkFile(`./${this.folder}/${i}.webp`).then(exists => {
                    if (exists) images.push({ path: `./${this.folder}/${i}.webp`, num: i });
                })
            );
        }

        await Promise.all(checks);
        
        images.sort((a, b) => a.num - b.num);
        return [...new Set(images.map(img => img.path))];
    }

    async checkFile(path, timeout = 2000) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const response = await fetch(path, { 
                method: 'HEAD',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.startsWith('image/')) {
                    console.log('✅ 找到图片:', path);
                    return true;
                }
            }
            return false;
        } catch (e) {
            return false;
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

    render() {
        const viewer = document.querySelector('.viewer');
        viewer.innerHTML = `
            <div class="slides-container" id="slidesContainer"></div>
            <button class="nav-btn prev-btn" id="prevBtn" aria-label="上一张">‹</button>
            <button class="nav-btn next-btn" id="nextBtn" aria-label="下一张">›</button>
            <div class="top-bar">
                <span class="image-name" id="imageName"></span>
                <span class="counter" id="counter">0 / ${this.images.length}</span>
            </div>
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

        const slidesContainer = document.getElementById('slidesContainer');
        const thumbnailContainer = document.getElementById('thumbnailContainer');

        const slideFragment = document.createDocumentFragment();
        const thumbFragment = document.createDocumentFragment();

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
            loadingDiv.innerHTML = `
                <div class="spinner"></div>
                <div class="loading-text">${index + 1}/${this.images.length}</div>
            `;
            slide.appendChild(loadingDiv);

            const img = document.createElement('img');
            img.src = src;
            img.alt = `图片 ${index + 1}`;
            img.loading = index < 3 ? 'eager' : 'lazy';
            
            img.onload = () => {
                img.classList.add('loaded');
                loadingDiv.style.opacity = '0';
                setTimeout(() => loadingDiv.remove(), 400);
                this.loadedImages.add(index);
            };

            img.onerror = () => {
                loadingDiv.innerHTML = `
                    <div style="color:white;font-size:40px;">⚠️</div>
                    <div class="loading-text" style="color:#ff4757;">
                        加载失败<br>
                        <span style="font-size:10px;">${this.getFileName(src)}</span>
                    </div>
                `;
            };

            slide.appendChild(img);
            slideFragment.appendChild(slide);

            const thumb = document.createElement('div');
            thumb.className = 'thumbnail';
            thumb.setAttribute('data-index', index);
            thumb.setAttribute('title', this.getFileName(src));
            
            const thumbImg = document.createElement('img');
            thumbImg.src = src;
            thumbImg.loading = 'lazy';
            thumbImg.onerror = () => {
                thumbImg.src = 'data:image/svg+xml,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="85">' +
                    '<rect fill="#333" width="64" height="85"/>' +
                    '<text fill="#666" x="32" y="45" text-anchor="middle" font-size="10">×</text>' +
                    '</svg>'
                );
            };
            
            thumb.appendChild(thumbImg);
            thumbFragment.appendChild(thumb);
        });

        slidesContainer.appendChild(slideFragment);
        thumbnailContainer.appendChild(thumbFragment);
    }

    getFileName(path) {
        try {
            return decodeURIComponent(path.split('/').pop());
        } catch (e) {
            return path.split('/').pop();
        }
    }

    bindEvents() {
        // 返回按钮
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
                case 'ArrowLeft':
                    e.preventDefault();
                    this.prevSlide();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.nextSlide();
                    break;
                case 'Escape':
                    this.hideThumbnails();
                    break;
                case ' ':
                    e.preventDefault();
                    this.toggleAutoPlay();
                    break;
                case 'Home':
                    e.preventDefault();
                    this.goToSlide(0);
                    break;
                case 'End':
                    e.preventDefault();
                    this.goToSlide(this.images.length - 1);
                    break;
            }
        });

        const viewer = document.querySelector('.viewer');
        
        viewer.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
            this.isSwiping = true;
        }, { passive: true });

        viewer.addEventListener('touchmove', (e) => {
            if (!this.isSwiping) return;
            this.touchEndX = e.touches[0].clientX;
            this.touchEndY = e.touches[0].clientY;
        }, { passive: true });

        viewer.addEventListener('touchend', () => {
            if (!this.isSwiping) return;
            this.handleSwipe();
            this.isSwiping = false;
        });

        let isDragging = false;
        let startX = 0;
        let startY = 0;

        viewer.addEventListener('mousedown', (e) => {
            if (e.target.closest('button') || e.target.closest('.thumbnail')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            viewer.style.cursor = 'grabbing';
        });

        viewer.addEventListener('mouseup', (e) => {
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
            if (isDragging) {
                isDragging = false;
                viewer.style.cursor = 'default';
            }
        });

        document.getElementById('thumbnailContainer').addEventListener('click', (e) => {
            const thumb = e.target.closest('.thumbnail');
            if (thumb) {
                const index = parseInt(thumb.getAttribute('data-index'));
                this.goToSlide(index);
            }
        });

        viewer.addEventListener('wheel', (e) => {
            if (e.target.closest('.thumbnail-container')) return;
            e.preventDefault();
            if (Math.abs(e.deltaX) > 10 || Math.abs(e.deltaY) > 30) {
                if (e.deltaX > 0 || e.deltaY > 0) this.nextSlide();
                else this.prevSlide();
            }
        }, { passive: false });

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.detectDeviceAndSetBackground();
                this.updateBackgrounds();
            }, 500);
        });

        viewer.addEventListener('dblclick', (e) => {
            if (e.target.closest('button') || e.target.closest('.thumbnail')) return;
            this.toggleFullscreen();
        });
    }

    handleSwipe() {
        const diffX = this.touchEndX - this.touchStartX;
        const diffY = this.touchEndY - this.touchStartY;

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > this.swipeThreshold) {
            if (diffX > 0) this.prevSlide();
            else this.nextSlide();
        }
    }

    goToSlide(index) {
        if (index < 0 || index >= this.images.length) return;

        this.currentIndex = index;
        const slidesContainer = document.getElementById('slidesContainer');
        slidesContainer.style.transform = `translateX(-${index * 100}%)`;

        this.updateCounter();
        this.updateImageName();
        this.updateThumbnails();
        this.preloadAdjacentImages(index);
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

    updateCounter() {
        const counter = document.getElementById('counter');
        if (counter) {
            counter.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
        }
    }

    updateImageName() {
        const imageName = document.getElementById('imageName');
        if (imageName && this.images[this.currentIndex]) {
            imageName.textContent = this.getFileName(this.images[this.currentIndex]);
        }
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
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center'
                });
            }, 100);
        }
    }

    updateBackgrounds() {
        const bgDivs = document.querySelectorAll('.slide-bg');
        bgDivs.forEach(bg => {
            bg.style.backgroundImage = this.backgroundImage;
        });
    }

    preloadAdjacentImages(index) {
        const indicesToPreload = [
            index - 2, index - 1, index, index + 1, index + 2
        ].filter(i => i >= 0 && i < this.images.length && !this.loadedImages.has(i));

        indicesToPreload.forEach(i => {
            const img = new Image();
            img.src = this.images[i];
            img.onload = () => this.loadedImages.add(i);
            this.preloadedImages.set(i, img);
        });
    }

    toggleThumbnails() {
        const bar = document.getElementById('thumbnailBar');
        const controls = document.getElementById('bottomControls');
        if (!bar || !controls) return;
        
        const isActive = bar.classList.contains('active');
        if (isActive) {
            this.hideThumbnails();
        } else {
            bar.classList.add('active');
            controls.classList.add('shifted');
            this.updateThumbnails();
        }
    }

    hideThumbnails() {
        const bar = document.getElementById('thumbnailBar');
        const controls = document.getElementById('bottomControls');
        if (bar) bar.classList.remove('active');
        if (controls) controls.classList.remove('shifted');
    }

    toggleAutoPlay() {
        const btn = document.getElementById('autoPlayBtn');
        if (!btn) return;
        
        if (this.isAutoPlaying) {
            clearInterval(this.autoPlayInterval);
            btn.innerHTML = '<span>▶</span> 自动播放';
            this.isAutoPlaying = false;
        } else {
            this.autoPlayInterval = setInterval(() => {
                this.nextSlide();
            }, this.autoPlayDelay);
            btn.innerHTML = '<span>⏸</span> 停止播放';
            this.isAutoPlaying = true;
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    }

    showError() {
        const viewer = document.querySelector('.viewer');
        viewer.innerHTML = `
            <div style="
                color: white;
                text-align: center;
                padding: 40px 20px;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 100%;
                max-width: 500px;
            ">
                <div style="font-size: 60px; margin-bottom: 20px;">📁</div>
                <div style="font-size: 18px; margin-bottom: 30px; line-height: 1.6;">
                    未找到 ${this.albumTitle} 图片<br>
                    <span style="font-size: 14px; color: #999;">
                        请将图片放入 ${this.folder} 文件夹
                    </span>
                </div>
                <button onclick="window.location.href='index.html'" style="
                    background: rgba(255,255,255,0.2);
                    color: white;
                    border: 1px solid rgba(255,255,255,0.3);
                    padding: 12px 30px;
                    border-radius: 50px;
                    font-size: 16px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">← 返回选择</button>
            </div>
        `;
    }
}

// 防止移动端手势缩放
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    window.viewer = new ImageViewer();
});