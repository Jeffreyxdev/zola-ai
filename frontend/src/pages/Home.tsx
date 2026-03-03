
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import CardSwap, { Card } from '../components/CardSwap';
import GradualBlur from '../components/GradualBlur';
import GhostCursor from '../components/GhostCursor';
const Section = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <motion.section 
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-100px" }}
    transition={{ duration: 0.8, ease: "easeOut" }}
    className={`py-24 px-6 max-w-5xl mx-auto ${className}`}
  >
    {children}
  </motion.section>
);
const CommandLine = ({ command, delay = 0 }: { command: string; delay?: number }) => {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setStarted(true);
      let i = 0;
      const interval = setInterval(() => {
        setDisplayed(command.slice(0, i));
        i++;
        if (i > command.length) clearInterval(interval);
      }, 28);
      return () => clearInterval(interval);
    }, delay * 1000);
    return () => clearTimeout(t);
  }, [command, delay]);
  return (
    <div className="flex items-start gap-3 py-1.5 font-mono text-[13px]">
      <span className="text-[#8b5cf6] shrink-0">▸</span>
      <span className="text-white/80">
        {displayed}
        {started && displayed.length < command.length ? <span className="animate-pulse">|</span> : null}
      </span>
    </div>
  );
};


export default function LandingPage() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check window width on mount and resize
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Set initial value
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return (
    <div className="bg-[#050505] text-white min-h-screen font-sans selection:bg-white selection:text-black">

     <nav className="fixed top-0 w-full p-4 md:p-6 flex justify-between items-center z-50">
        <div className="text-lg md:text-xl font-bold tracking-tighter">zola</div>
        <div className="text-xs tracking-widest text-gray-400">
          <a href="#" className="hover:text-white transition">MENU</a>
        </div>
      </nav>
      {/* Hero */}
      <section className="relative py-32 px-6 text-center overflow-hidden">
        {/* decorative animated background */}
        {/* choose one of the two below; comment out the other as needed */}
        <GhostCursor />
        {/* <GhostCursorBackground /> */}
        <div className="relative z-10">
        <motion.h1 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-5xl md:text-7xl font-light mb-8 tracking-tight leading-[1.1]"
        >
         Autonomous AI on Solana. <br />that runs on Twitter 
        </motion.h1>
        <p className="text-gray-400 mb-10 max-w-lg mx-auto leading-relaxed">
           Trade, DCA, and execute instantly on Twitter, fueled by liquidity, built on Solana."
        </p>
        <button className="bg-white text-black px-10 py-4 rounded-full font-medium hover:bg-gray-200 transition-all hover:scale-105 active:scale-95">
          LAUNCH APP
        </button>
        </div>
      </section>

      {/* Liquidity Comparison */}
      <Section>
        <div className="flex flex-col md:flex-row gap-16 items-center">
       <div className="flex-1">
  <h2 className="text-4xl font-light mb-6 tracking-tight">
    Execute strategies in seconds  not dashboards
  </h2>
  <p className="text-gray-400">
    An AI native DeFi bot that understands natural language, routes liquidity intelligently, and executes trades directly from your wallet or Twitter.
  </p>
</div>
          
        <div className="flex-1 w-full bg-white/5 p-8 rounded-2xl border border-white/10 backdrop-blur-sm">
  <div className="grid grid-cols-3 gap-4 text-xs uppercase tracking-widest text-gray-500 mb-6 border-b border-white/10 pb-4">
    <span>Capability</span>
    <span>Zola AI</span>
    <span>Traditional DeFi</span>
  </div>

  {[
    { label: 'Execution Speed', a: 'Instant (AI Routed)', b: 'Manual / Delayed' },
    { label: 'Interaction', a: 'Wallet + Twitter', b: 'Dashboard Only' },
    { label: 'Automation', a: 'Autonomous Strategies', b: 'Manual Setup' },
    { label: 'Fees', a: 'Optimized Routing', b: 'Static Pool Fees' },
    { label: 'Intelligence', a: 'Natural Language AI', b: 'No AI Layer' },
  ].map((row, i) => (
    <div
      key={i}
      className="grid grid-cols-3 gap-4 py-4 border-b border-white/5 text-sm"
    >
      <span className="text-gray-400">{row.label}</span>
      <span className="font-semibold text-white">{row.a}</span>
      <span className="text-gray-500">{row.b}</span>
    </div>
  ))}
</div>
        </div>
        <motion.div
            className="lg:w-1/2 relative w-full mt-12 lg:mt-0"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
          >
            <div className="rounded-2xl overflow-hidden bg-[#111115] border border-white/10 shadow-2xl relative">
              <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-white/20 to-transparent" />
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-black/40">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                <span className="ml-2 text-[11px] text-white/40 font-mono">zola ~ active bot</span>
              </div>
              <div className="p-6 space-y-2 h-65">
                 <CommandLine command="@use_zola trade 10 SOL → USDC" delay={0.5} />
                <CommandLine command="✓ Routing via best liquidity pool" delay={1.8} />
                <CommandLine command="@use_zola set DCA $100 weekly on SOL" delay={3.5} />
                <CommandLine command="✓ Strategy scheduled & live" delay={5.0} /> 
              </div>
            </div>
          </motion.div>
      </Section>
      {/* card carousel - full height container centered */}
 {/* card carousel - full height container centered */}
    <div className="relative w-full min-h-96 md:min-h-125 mt-10 md:mt-20 flex items-center justify-center px-4 overflow-hidden">
      <div className="w-full max-w-sm md:max-w-4xl">
        <CardSwap
          width="100%" 
          height="auto" // Allows the internal content to dictate height
          cardDistance={isMobile ? 30 : 60} // Dynamically reacts to screen size
          verticalDistance={isMobile ? 40 : 70}
          delay={5000}
          pauseOnHover={false}
        >
          <Card>
            <div className="space-y-4 p-2 md:p-4">
              {/* Optional particle/wave visual placeholder */}
              <div className="h-32 rounded-xl bg-linear-to-br from-purple-500/20 via-indigo-500/10 to-transparent border border-white/10 relative overflow-hidden">
                <div className="absolute inset-0 animate-pulse opacity-30 bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.4),transparent_70%)]" />
              </div>

              <h3 className="text-lg md:text-xl font-semibold tracking-tight">
                Intelligent Liquidity Waves
              </h3>

              <p className="text-gray-400 text-sm leading-relaxed">
                Our AI scans markets in real time, riding liquidity waves across chains to
                execute trades at optimal pricing with minimal spread.
              </p>
            </div>
          </Card>

          <Card>
            <div className="space-y-4 p-2 md:p-4">
              {/* Particle motion visual */}
              <div className="h-32 rounded-xl bg-linear-to-br from-cyan-500/20 via-blue-500/10 to-transparent border border-white/10 relative overflow-hidden">
                <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle,rgba(34,211,238,0.4)_1px,transparent_1px)] bg-size-[12px_12px] animate-[pulse_4s_ease-in-out_infinite]" />
              </div>

              <h3 className="text-lg md:text-xl font-semibold tracking-tight">
                Natural Language Execution
              </h3>

              <p className="text-gray-400 text-sm leading-relaxed">
                Trade, automate, and rebalance using simple commands.  
                Tweet it. Message it. The AI interprets intent and executes instantly.
              </p>
            </div>
          </Card>

          <Card>
            <div className="space-y-4 p-2 md:p-4">
              {/* Energy grid visual */}
              <div className="h-32 rounded-xl bg-linear-to-br from-amber-500/20 via-orange-500/10 to-transparent border border-white/10 relative overflow-hidden">
                <div className="absolute inset-0 opacity-30 bg-[linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-size-[24px_24px]" />
              </div>

              <h3 className="text-lg md:text-xl font-semibold tracking-tight">
                Autonomous Strategy Engine
              </h3>

              <p className="text-gray-400 text-sm leading-relaxed">
                Deploy DCA, hedging, and yield strategies that adapt dynamically to
                volatility powered by predictive AI models.
              </p>
            </div>
          </Card>
        </CardSwap>
      </div>
    </div>

<section style={{position: 'relative',height: 500,overflow: 'hidden'}}>
  <div style={{ height: '100%',overflowY: 'auto',padding: '6rem 2rem',maxWidth: 900,
      margin: '0 auto',
      textAlign: 'center' }}>
     
    <h2
      style={{
        fontSize: '3rem',
        fontWeight: 300,
        letterSpacing: '-0.02em',
        marginBottom: '1.5rem'
      }}
    >
      Intelligence is the new liquidity layer
    </h2>

    <p
      style={{
        color: '#9ca3af',
        fontSize: '1.1rem',
        lineHeight: 1.8,
        maxWidth: 640,
        margin: '0 auto'
      }}
    >
      Our AI-native DeFi bot interprets intent, monitors on-chain conditions,
      and executes strategies across markets in real time.
      <br /><br />
      No dashboards. No friction. Just signal → execution.
    </p>
  
  </div>

  <GradualBlur
    target="parent"
    position="bottom"
    height="7rem"
    strength={2}
    divCount={5}
    curve="bezier"
    exponential
    opacity={1}
  />
</section>


      {/* Partners Grid */}
      <footer className="py-24 border-t border-white/10">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-gray-500 uppercase tracking-[0.2em] text-[10px] mb-12">Investors & Partners</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-12 items-center opacity-60">
            {['Galaxy', 'Wintermute', 'FalconX', 'Variant', 'Archetype', 'Reverie'].map((name) => (
              <div key={name} className="hover:opacity-100 transition-opacity cursor-pointer text-sm font-semibold">
                {name}
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}