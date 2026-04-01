// APP/js/analysis-animation.js

const analysisAnimation = (() => {
    let cv, ctx, W, H, t;
    let scanProgress, scanDirection, activeLine, lineTimer, blinkTimer, isBlinking;
    let particles;
    let animationFrameId;
    let dotsIntervalId;

    const LINE_PROGRESS_STEP = 0.005;
    const ROBOT_SCAN_X = 238;
    const RECEIPT_X = 42;
    const RECEIPT_Y = 22;
    const RECEIPT_W = 126;
    const RECEIPT_H = 164;
    const RECEIPT_LINES = [
        { width: 0.72, kind: 'header' },
        { width: 0.56, kind: 'item' },
        { width: 0.82, kind: 'item' },
        { width: 0.68, kind: 'item' },
        { width: 0.48, kind: 'item' },
        { width: 0.74, kind: 'item' },
        { width: 0.66, kind: 'item' },
        { width: 0.58, kind: 'total' },
    ];

    const COL = {
        bg: '#0d1321',
        panel: '#141c2b',
        panelSoft: '#1a2436',
        border: 'rgba(148, 163, 184, 0.18)',
        borderStrong: 'rgba(148, 163, 184, 0.3)',
        textMuted: 'rgba(203, 213, 225, 0.42)',
        receipt: '#f8fafc',
        receiptText: '#475569',
        receiptGlow: 'rgba(96, 165, 250, 0.14)',
        cyan: '#67e8f9',
        cyanSoft: 'rgba(103, 232, 249, 0.28)',
        blue: '#93c5fd',
        blueSoft: 'rgba(147, 197, 253, 0.18)',
        amber: '#fbbf24',
        pink: '#f9a8d4',
        shadow: 'rgba(15, 23, 42, 0.45)',
    };

    function rr(x, y, w, h, r, fill, stroke, sw) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r || 0);
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = sw || 1;
            ctx.stroke();
        }
    }

    function drawBackdrop() {
        const gradient = ctx.createLinearGradient(0, 0, W, H);
        gradient.addColorStop(0, '#0f172a');
        gradient.addColorStop(1, '#111827');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        for (let x = 18; x < W; x += 28) {
            for (let y = 18; y < H; y += 28) {
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function drawReceipt() {
        const shadowY = 4 + Math.sin(t * 0.03) * 1.5;
        ctx.save();
        ctx.shadowColor = COL.shadow;
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 10;
        rr(RECEIPT_X, RECEIPT_Y + shadowY, RECEIPT_W, RECEIPT_H, 18, COL.receipt, null);
        ctx.restore();

        rr(RECEIPT_X, RECEIPT_Y, RECEIPT_W, RECEIPT_H, 18, COL.receipt, COL.borderStrong, 1);

        ctx.fillStyle = COL.receiptText;
        ctx.font = '700 10px monospace';
        ctx.fillText('PARAGON', RECEIPT_X + 16, RECEIPT_Y + 22);

        ctx.fillStyle = 'rgba(71, 85, 105, 0.18)';
        ctx.fillRect(RECEIPT_X + 16, RECEIPT_Y + 30, RECEIPT_W - 32, 1);

        const topInset = 42;
        const bottomInset = 18;
        const activeY = RECEIPT_Y + topInset + scanProgress * (RECEIPT_H - topInset - bottomInset);

        ctx.fillStyle = COL.receiptGlow;
        ctx.fillRect(RECEIPT_X + 10, RECEIPT_Y + topInset, RECEIPT_W - 20, activeY - (RECEIPT_Y + topInset));

        RECEIPT_LINES.forEach((line, index) => {
            const y = RECEIPT_Y + topInset + index * 14;
            const width = (RECEIPT_W - 34) * line.width;
            const isActive = index === activeLine;
            const isPast = index < activeLine;

            if (line.kind === 'total') {
                ctx.fillStyle = isPast || isActive ? '#0f172a' : 'rgba(71, 85, 105, 0.24)';
                ctx.fillRect(RECEIPT_X + 16, y + 7, RECEIPT_W - 32, 1.25);
            }

            if (isActive) {
                rr(RECEIPT_X + 12, y - 4, RECEIPT_W - 24, 10, 5, 'rgba(96, 165, 250, 0.14)', null);
            }

            ctx.fillStyle = isActive
                ? '#0f172a'
                : isPast
                    ? 'rgba(15, 23, 42, 0.82)'
                    : 'rgba(71, 85, 105, 0.28)';
            rr(RECEIPT_X + 16, y, width, 4.2, 3, ctx.fillStyle, null);

            if (line.kind === 'item') {
                ctx.fillStyle = isActive || isPast ? 'rgba(15, 23, 42, 0.45)' : 'rgba(71, 85, 105, 0.16)';
                rr(RECEIPT_X + RECEIPT_W - 38, y, 22, 4.2, 3, ctx.fillStyle, null);
            }
        });

        ctx.strokeStyle = COL.cyan;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(RECEIPT_X + 8, activeY);
        ctx.lineTo(RECEIPT_X + RECEIPT_W - 8, activeY);
        ctx.stroke();

        ctx.fillStyle = COL.cyan;
        ctx.beginPath();
        ctx.arc(RECEIPT_X + 12, activeY, 2.4, 0, Math.PI * 2);
        ctx.arc(RECEIPT_X + RECEIPT_W - 12, activeY, 2.4, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawScannerBeam(robotY, targetY) {
        const beamStartX = ROBOT_SCAN_X - 12;
        const beamStartY = robotY - 2;
        const beamEndX = RECEIPT_X + RECEIPT_W + 4;

        ctx.save();
        ctx.strokeStyle = COL.cyanSoft;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(beamStartX, beamStartY);
        ctx.lineTo(beamEndX, targetY);
        ctx.stroke();

        ctx.strokeStyle = COL.cyan;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(beamStartX, beamStartY);
        ctx.lineTo(beamEndX, targetY);
        ctx.stroke();
        ctx.restore();
    }

    function drawRobot() {
        const bob = Math.sin(t * 0.035) * 4;
        const bodyX = ROBOT_SCAN_X;
        const bodyY = 100 + bob;
        const scanHeadY = RECEIPT_Y + 42 + scanProgress * 102;

        drawScannerBeam(scanHeadY, scanHeadY);

        ctx.save();
        ctx.translate(bodyX, bodyY);

        ctx.strokeStyle = COL.borderStrong;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -48);
        ctx.lineTo(0, -60);
        ctx.stroke();
        ctx.fillStyle = COL.amber;
        ctx.beginPath();
        ctx.arc(0, -63, 4, 0, Math.PI * 2);
        ctx.fill();

        rr(-34, -30, 68, 44, 16, COL.panel, COL.borderStrong, 1.5);
        rr(-26, -21, 52, 24, 12, '#0f172a', null);

        const blinkHeight = isBlinking ? 2 : 10;
        [-12, 12].forEach((eyeX) => {
            rr(eyeX - 8, -15, 16, blinkHeight, 8, COL.blueSoft, COL.blue, 1);
            if (!isBlinking) {
                ctx.fillStyle = COL.cyan;
                ctx.beginPath();
                ctx.arc(eyeX, -10, 2.4, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        ctx.strokeStyle = 'rgba(226, 232, 240, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, 2);
        ctx.quadraticCurveTo(0, 8 + Math.sin(t * 0.05) * 2, 10, 2);
        ctx.stroke();

        rr(-28, 18, 56, 48, 18, COL.panelSoft, COL.borderStrong, 1.5);
        rr(-20, 28, 40, 8, 4, 'rgba(103, 232, 249, 0.16)', null);
        rr(-20, 41, 28 + Math.sin(t * 0.05) * 8, 8, 4, 'rgba(147, 197, 253, 0.18)', null);

        ctx.strokeStyle = COL.borderStrong;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-20, 26);
        ctx.lineTo(-40, 44 + Math.sin(t * 0.05) * 2);
        ctx.moveTo(20, 26);
        ctx.lineTo(36, scanHeadY - bodyY);
        ctx.moveTo(-12, 66);
        ctx.lineTo(-18, 90);
        ctx.moveTo(12, 66);
        ctx.lineTo(18, 90);
        ctx.stroke();

        ctx.fillStyle = COL.cyan;
        ctx.beginPath();
        ctx.arc(36, scanHeadY - bodyY, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = COL.panel;
        ctx.beginPath();
        ctx.arc(36, scanHeadY - bodyY, 3, 0, Math.PI * 2);
        ctx.fill();

        rr(-24, 88, 16, 7, 4, COL.panelSoft, null);
        rr(8, 88, 16, 7, 4, COL.panelSoft, null);
        ctx.restore();
    }

    function drawParticles() {
        particles.forEach((particle) => {
            ctx.save();
            ctx.globalAlpha = particle.life * 0.8;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }

    function updateParticles() {
        if (t % 7 === 0) {
            particles.push({
                x: RECEIPT_X + RECEIPT_W + 8,
                y: RECEIPT_Y + 42 + scanProgress * 102 + (Math.random() - 0.5) * 10,
                vx: 1.2 + Math.random() * 0.8,
                vy: (Math.random() - 0.5) * 0.4,
                size: 1.8 + Math.random() * 1.6,
                life: 1,
                color: Math.random() > 0.5 ? COL.cyan : COL.pink,
            });
        }

        for (let i = particles.length - 1; i >= 0; i -= 1) {
            const particle = particles[i];
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life -= 0.025;
            if (particle.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    function update() {
        t += 1;
        scanProgress += LINE_PROGRESS_STEP * scanDirection;

        if (scanProgress >= 1) {
            scanProgress = 1;
            scanDirection = -1;
        }
        if (scanProgress <= 0) {
            scanProgress = 0;
            scanDirection = 1;
        }

        lineTimer += 1;
        if (lineTimer > 20) {
            lineTimer = 0;
            activeLine = (activeLine + 1) % RECEIPT_LINES.length;
        }

        blinkTimer += 1;
        if (blinkTimer > 108) {
            isBlinking = true;
        }
        if (blinkTimer > 114) {
            isBlinking = false;
            blinkTimer = 0;
        }

        updateParticles();
    }

    function draw() {
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);
        drawBackdrop();
        drawReceipt();
        drawParticles();
        drawRobot();

        // V12 TEST BORDER
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, W, H);
    }

    function loop() {
        if (t % 60 === 0) console.log('[V12] Drawing frame, t:', t);
        update();
        draw();
        animationFrameId = requestAnimationFrame(loop);
    }

    function init() {
        cv = document.getElementById('analysis-scan-canvas');
        console.log('[V12] Initializing with canvas:', cv);
        if (!cv) return;
        ctx = cv.getContext('2d');
        W = 360;
        H = 208;
        cv.width = W;
        cv.height = H;
        reset();
    }

    function reset() {
        t = 0;
        scanProgress = 0;
        scanDirection = 1;
        activeLine = 0;
        lineTimer = 0;
        blinkTimer = 0;
        isBlinking = false;
        particles = [];
    }

    function start() {
        init();
        if (!ctx) return;

        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        if (dotsIntervalId) {
            clearInterval(dotsIntervalId);
        }

        reset();
        loop();

        let dotState = 0;
        const dotsEl = document.getElementById('dots');
        dotsIntervalId = setInterval(() => {
            if (dotsEl) {
                dotState = (dotState + 1) % 4;
                dotsEl.textContent = ['.', '..', '...', ''][dotState];
            }
        }, 500);
    }

    function stop() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (dotsIntervalId) {
            clearInterval(dotsIntervalId);
            dotsIntervalId = null;
        }
        if (ctx) {
            ctx.clearRect(0, 0, W, H);
        }
    }

    return {
        start,
        stop,
    };
})();
