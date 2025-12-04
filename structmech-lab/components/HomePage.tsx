import React, { useEffect, useRef, useCallback } from 'react';
import {
  GitBranch, TrendingUp, Calculator, Sparkles, Layers, Box, Triangle, Archive,
  Activity, Zap, BarChart3, BookOpen, ChevronRight, Shapes, Bot
} from 'lucide-react';

interface HomePageProps {
  onNavigate: (module: 'static' | 'influence' | 'solver', subModule?: string) => void;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  radius: number; color: string; alpha: number; targetAlpha: number;
}

interface FloatingShape {
  x: number; y: number; size: number; rotation: number; rotationSpeed: number;
  type: 'triangle' | 'square' | 'hexagon' | 'circle'; color: string; alpha: number; vx: number; vy: number;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const particlesRef = useRef<Particle[]>([]);
  const shapesRef = useRef<FloatingShape[]>([]);
  const animationRef = useRef<number>(0);
  const timeRef = useRef(0);

  const initParticles = useCallback((width: number, height: number) => {
    const colors = ['#818cf8', '#a78bfa', '#c4b5fd', '#6366f1', '#8b5cf6', '#a5b4fc'];
    particlesRef.current = Array.from({ length: 100 }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8,
      radius: Math.random() * 2.5 + 1, color: colors[Math.floor(Math.random() * colors.length)],
      alpha: Math.random() * 0.6 + 0.2, targetAlpha: Math.random() * 0.6 + 0.2,
    }));

    const shapeTypes: FloatingShape['type'][] = ['triangle', 'square', 'hexagon', 'circle'];
    shapesRef.current = Array.from({ length: 15 }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      size: Math.random() * 40 + 20, rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
      type: shapeTypes[Math.floor(Math.random() * shapeTypes.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: Math.random() * 0.15 + 0.05,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (particlesRef.current.length === 0) initParticles(canvas.width, canvas.height);
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const handleMouseMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const handleMouseLeave = () => { mouseRef.current = { x: -1000, y: -1000 }; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    const drawShape = (shape: FloatingShape) => {
      ctx.save();
      ctx.translate(shape.x, shape.y);
      ctx.rotate(shape.rotation);
      ctx.globalAlpha = shape.alpha;
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 1.5;
      switch (shape.type) {
        case 'triangle':
          ctx.beginPath();
          ctx.moveTo(0, -shape.size / 2);
          ctx.lineTo(-shape.size / 2, shape.size / 2);
          ctx.lineTo(shape.size / 2, shape.size / 2);
          ctx.closePath();
          ctx.stroke();
          break;
        case 'square':
          ctx.strokeRect(-shape.size / 2, -shape.size / 2, shape.size, shape.size);
          break;
        case 'hexagon':
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            const x = Math.cos(angle) * shape.size / 2;
            const y = Math.sin(angle) * shape.size / 2;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
          break;
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, shape.size / 2, 0, Math.PI * 2);
          ctx.stroke();
          break;
      }
      ctx.restore();
    };


    const animate = () => {
      timeRef.current += 0.016;
      const time = timeRef.current;

      // 渐变背景
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#020617');
      gradient.addColorStop(0.3, '#0f172a');
      gradient.addColorStop(0.6, '#1e1b4b');
      gradient.addColorStop(1, '#020617');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 动态网格
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 50;
      const offsetX = (time * 8) % gridSize;
      const offsetY = (time * 6) % gridSize;
      for (let x = -gridSize + offsetX; x < canvas.width + gridSize; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = -gridSize + offsetY; y < canvas.height + gridSize; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // 光晕效果
      const drawGlow = (x: number, y: number, radius: number, color: string, alpha: number) => {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, color.replace(')', `, ${alpha})`).replace('rgb', 'rgba'));
        glow.addColorStop(0.5, color.replace(')', `, ${alpha * 0.3})`).replace('rgb', 'rgba'));
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      };

      // 动态光晕
      drawGlow(canvas.width * 0.2 + Math.sin(time * 0.5) * 100, canvas.height * 0.3 + Math.cos(time * 0.3) * 80, 450, 'rgb(99, 102, 241)', 0.18);
      drawGlow(canvas.width * 0.8 + Math.cos(time * 0.4) * 120, canvas.height * 0.6 + Math.sin(time * 0.6) * 100, 400, 'rgb(139, 92, 246)', 0.15);
      drawGlow(canvas.width * 0.5 + Math.sin(time * 0.7) * 80, canvas.height * 0.85 + Math.cos(time * 0.5) * 60, 350, 'rgb(168, 85, 247)', 0.1);

      const mouse = mouseRef.current;
      if (mouse.x > 0 && mouse.y > 0) drawGlow(mouse.x, mouse.y, 280, 'rgb(129, 140, 248)', 0.25);

      // 浮动形状
      shapesRef.current.forEach((shape) => {
        const dx = mouse.x - shape.x, dy = mouse.y - shape.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200 && dist > 0) {
          const force = (200 - dist) / 200 * 0.5;
          shape.vx -= (dx / dist) * force;
          shape.vy -= (dy / dist) * force;
        }
        shape.x += shape.vx; shape.y += shape.vy;
        shape.rotation += shape.rotationSpeed;
        shape.vx *= 0.99; shape.vy *= 0.99;
        if (shape.x < -50) shape.x = canvas.width + 50;
        if (shape.x > canvas.width + 50) shape.x = -50;
        if (shape.y < -50) shape.y = canvas.height + 50;
        if (shape.y > canvas.height + 50) shape.y = -50;
        drawShape(shape);
      });


      // 粒子系统
      particlesRef.current.forEach((p, i) => {
        const dx = mouse.x - p.x, dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200 && dist > 0) {
          const force = (200 - dist) / 200 * 0.08;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
          p.targetAlpha = 0.9;
        } else {
          p.targetAlpha = Math.random() * 0.5 + 0.2;
        }
        p.alpha += (p.targetAlpha - p.alpha) * 0.05;
        p.x += p.vx; p.y += p.vy;
        p.vx += (Math.random() - 0.5) * 0.02;
        p.vy += (Math.random() - 0.5) * 0.02;
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 3) { p.vx = (p.vx / speed) * 3; p.vy = (p.vy / speed) * 3; }
        p.vx *= 0.98; p.vy *= 0.98;
        if (p.x < 0) { p.x = 0; p.vx *= -0.5; }
        if (p.x > canvas.width) { p.x = canvas.width; p.vx *= -0.5; }
        if (p.y < 0) { p.y = 0; p.vy *= -0.5; }
        if (p.y > canvas.height) { p.y = canvas.height; p.vy *= -0.5; }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;

        // 粒子连线
        particlesRef.current.slice(i + 1).forEach((p2) => {
          const d = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
          if (d < 150) {
            const lineAlpha = ((150 - d) / 150) * 0.4 * Math.min(p.alpha, p2.alpha);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(129, 140, 248, ${lineAlpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        });

        // 鼠标连线
        if (dist < 180 && mouse.x > 0) {
          const lineAlpha = ((180 - dist) / 180) * 0.7;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `rgba(139, 92, 246, ${lineAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });

      // 鼠标装饰圆环
      if (mouse.x > 0 && mouse.y > 0) {
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 25 + Math.sin(time * 3) * 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(129, 140, 248, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 45 + Math.cos(time * 2) * 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 70 + Math.sin(time * 1.5) * 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    initParticles(canvas.width, canvas.height);
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [initParticles]);


  const stats = [
    { icon: <Shapes size={18} />, value: '10个', label: '学习模块' },
    { icon: <Zap size={18} />, value: '50+', label: '交互实验' },
    { icon: <TrendingUp size={18} />, value: '100+', label: '可视化图表' },
    { icon: <BookOpen size={18} />, value: '99%', label: '学习效率提升' },
  ];

  const modules = [
    { id: 'geometry', module: 'static', icon: <Shapes size={22} />, title: '几何组成分析', desc: '分析结构的几何组成，判断结构的几何不变性', color: 'from-blue-500 to-blue-600' },
    { id: 'beam', module: 'static', icon: <Box size={22} />, title: '静定梁', desc: '学习简支梁、悬臂梁的内力计算和弯矩图绘制', color: 'from-purple-500 to-purple-600' },
    { id: 'frame', module: 'static', icon: <GitBranch size={22} />, title: '静定刚架', desc: '理解刚架在各种荷载下的弯矩、剪力和轴力分布', color: 'from-pink-500 to-pink-600' },
    { id: 'truss', module: 'static', icon: <Triangle size={22} />, title: '静定桁架', desc: '分析桁架结构在节点荷载作用下的杆件内力', color: 'from-cyan-500 to-cyan-600' },
    { id: 'arch', module: 'static', icon: <Archive size={22} />, title: '静定拱', desc: '研究三铰拱的受力特性和推力计算', color: 'from-orange-500 to-orange-600' },
    { id: 'static-il', module: 'influence', sub: 'static', icon: <Activity size={22} />, title: '静力法', desc: '通过平衡方程计算影响线纵标值', color: 'from-emerald-500 to-emerald-600' },
    { id: 'kinematic', module: 'influence', sub: 'kinematic', icon: <Layers size={22} />, title: '机动法', desc: '利用虚功原理快速绘制影响线形状', color: 'from-amber-500 to-amber-600' },
    { id: 'envelope', module: 'influence', sub: 'envelope', icon: <BarChart3 size={22} />, title: '内力包络图', desc: '计算移动荷载下各截面的最大内力', color: 'from-rose-500 to-rose-600' },
    { id: 'application', module: 'influence', sub: 'application', icon: <TrendingUp size={22} />, title: '影响线应用', desc: '利用影响线求解实际荷载下的内力', color: 'from-indigo-500 to-indigo-600' },
    { id: 'solver', module: 'solver', icon: <Calculator size={22} />, title: '结构求解器', desc: '交互式构建和求解梁、桁架结构的内力和变形', color: 'from-violet-500 to-violet-600' },
  ];

  const handleModuleClick = (item: (typeof modules)[0]) => {
    if (item.module === 'solver') onNavigate('solver');
    else if (item.module === 'influence') onNavigate('influence', item.sub);
    else onNavigate('static', item.id);
  };


  return (
    <div className="relative w-full h-full overflow-auto">
      <canvas ref={canvasRef} className="fixed inset-0 z-0" />

      <div className="relative z-10 min-h-full flex flex-col items-center px-8 py-12">
        {/* 顶部标签 */}
        <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 backdrop-blur-sm mb-8 animate-fade-in">
          <Sparkles size={16} className="text-indigo-400 animate-pulse" />
          <span className="text-sm font-medium text-indigo-200">交互式结构力学学习平台</span>
          <Sparkles size={16} className="text-violet-400 animate-pulse" />
        </div>

        {/* 主标题 - 高级动效 */}
        <div className="relative mb-8 animate-fade-in-up">
          {/* 背景光效 */}
          <div className="absolute -inset-20 bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-purple-500/20 blur-3xl rounded-full animate-pulse-slow" />
          
          <h1 className="relative text-7xl font-black text-center leading-tight tracking-tight">
            <span className="text-white drop-shadow-2xl">结构力学</span>
            <br />
            <span className="relative inline-block">
              {/* 渐变文字 */}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 animate-gradient-x">
                可视化
              </span>
              {/* 下划线动效 */}
              <span className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 rounded-full animate-shimmer" />
            </span>
            <span className="text-white drop-shadow-2xl"> 实验室</span>
          </h1>
        </div>

        {/* 副标题 */}
        <p className="text-slate-400 text-lg mb-3 text-center max-w-2xl animate-fade-in-up animation-delay-200">
          通过动态可视化和实时模拟，让抽象的力学概念变得直观易懂
        </p>
        <p className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400 text-sm font-medium mb-12 animate-fade-in-up animation-delay-300">
          选择下方模块，开启你的学习之旅
        </p>

        {/* 统计数据 */}
        <div className="flex items-center gap-6 mb-14 animate-fade-in-up animation-delay-400">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="group flex items-center gap-4 px-6 py-4 rounded-2xl bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-slate-700/50 backdrop-blur-sm hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-500/20 hover:scale-105 transition-all duration-300 cursor-default"
              style={{ animationDelay: `${400 + i * 100}ms` }}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-900/50 group-hover:shadow-indigo-500/50 group-hover:scale-110 transition-all">
                <span className="text-white">{stat.icon}</span>
              </div>
              <div>
                <div className="text-2xl font-black text-white group-hover:text-indigo-100 transition-colors">{stat.value}</div>
                <div className="text-xs text-slate-400">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 模块卡片 */}
        <div className="grid grid-cols-5 gap-4 max-w-6xl w-full mb-14">
          {modules.map((item, i) => (
            <button
              key={item.id}
              onClick={() => handleModuleClick(item)}
              className="group relative bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-5 text-left transition-all duration-300 hover:border-indigo-500/40 hover:scale-[1.03] hover:shadow-2xl hover:shadow-indigo-500/20 animate-fade-in-up"
              style={{ animationDelay: `${600 + i * 50}ms` }}
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/5 to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className={`relative inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} text-white mb-4 shadow-lg shadow-indigo-900/30 group-hover:shadow-xl group-hover:shadow-indigo-500/30 group-hover:scale-110 transition-all duration-300`}>
                {item.icon}
              </div>
              <h3 className="relative text-base font-bold text-white mb-2 group-hover:text-indigo-100 transition-colors">{item.title}</h3>
              <p className="relative text-xs text-slate-400 mb-4 line-clamp-2 leading-relaxed group-hover:text-slate-300 transition-colors">{item.desc}</p>
              <div className="relative flex items-center text-xs font-semibold text-indigo-400 group-hover:text-indigo-300 transition-colors">
                开始学习
                <ChevronRight size={14} className="ml-1 group-hover:translate-x-2 transition-transform duration-300" />
              </div>
            </button>
          ))}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center gap-3 px-5 py-3 rounded-full bg-gradient-to-r from-slate-800/50 to-slate-900/50 border border-slate-700/50 backdrop-blur-sm animate-fade-in-up animation-delay-1000">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-900/50 animate-bounce-slow">
            <Bot size={16} className="text-white" />
          </div>
          <span className="text-sm text-slate-300">
            每个模块都配有 <span className="text-indigo-400 font-semibold">AI 智能助教</span>，随时解答你的疑问
          </span>
        </div>
      </div>

      {/* CSS 动画 */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes shimmer {
          0% { transform: scaleX(0); transform-origin: left; }
          50% { transform: scaleX(1); transform-origin: left; }
          50.1% { transform-origin: right; }
          100% { transform: scaleX(0); transform-origin: right; }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .animate-fade-in { animation: fade-in 0.8s ease-out forwards; }
        .animate-fade-in-up { animation: fade-in-up 0.8s ease-out forwards; opacity: 0; }
        .animate-gradient-x { background-size: 200% 200%; animation: gradient-x 3s ease infinite; }
        .animate-shimmer { animation: shimmer 3s ease-in-out infinite; }
        .animate-pulse-slow { animation: pulse-slow 4s ease-in-out infinite; }
        .animate-bounce-slow { animation: bounce-slow 2s ease-in-out infinite; }
        .animation-delay-200 { animation-delay: 200ms; }
        .animation-delay-300 { animation-delay: 300ms; }
        .animation-delay-400 { animation-delay: 400ms; }
        .animation-delay-1000 { animation-delay: 1000ms; }
      `}</style>
    </div>
  );
};

export default HomePage;
