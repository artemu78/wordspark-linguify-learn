import React, { useEffect, useRef } from 'react';

interface FireworkAnimationProps {
  onComplete?: () => void;
}

interface Firework {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  decay: number;
  color: string;
  size: number;
  life: number;
}

export const FireworkAnimation: React.FC<FireworkAnimationProps> = ({ onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const fireworksRef = useRef<Firework[]>([]);
  const startTimeRef = useRef<number>(Date.now());

  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8'];
  
  const createFirework = (x: number, y: number) => {
    const particleCount = 30;
    const fireworks: Firework[] = [];
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const velocity = Math.random() * 6 + 2;
      
      fireworks.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        alpha: 1,
        decay: Math.random() * 0.03 + 0.02,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 3 + 2,
        life: 1
      });
    }
    
    return fireworks;
  };

  const updateFireworks = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    
    fireworksRef.current = fireworksRef.current.filter(firework => {
      firework.x += firework.vx;
      firework.y += firework.vy;
      firework.vy += 0.1; // gravity
      firework.alpha -= firework.decay;
      firework.life -= firework.decay;
      
      if (firework.alpha > 0) {
        ctx.globalAlpha = firework.alpha;
        ctx.fillStyle = firework.color;
        ctx.beginPath();
        ctx.arc(firework.x, firework.y, firework.size, 0, Math.PI * 2);
        ctx.fill();
        return true;
      }
      return false;
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Create initial fireworks
    const createRandomFirework = () => {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height * 0.6 + canvas.height * 0.2;
      fireworksRef.current.push(...createFirework(x, y));
    };

    // Launch fireworks at intervals
    const fireworkInterval = setInterval(createRandomFirework, 300);
    
    // Initial burst
    for (let i = 0; i < 3; i++) {
      setTimeout(createRandomFirework, i * 100);
    }

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      
      if (elapsed < 4000) { // Run for 4 seconds
        updateFireworks(ctx, canvas.width, canvas.height);
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onComplete?.();
      }
    };

    animate();

    return () => {
      clearInterval(fireworkInterval);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-50 pointer-events-none"
      style={{ background: 'transparent' }}
    />
  );
};