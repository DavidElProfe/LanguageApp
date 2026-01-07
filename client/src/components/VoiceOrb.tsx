import { motion } from "framer-motion";
import { Mic, BrainCircuit, Volume2, Square, Zap } from "lucide-react";

type AgentState = "idle" | "listening" | "thinking" | "speaking" | "error";

interface VoiceOrbProps {
  state: AgentState;
  onStart: () => void;
  onStop: () => void;
}

export function VoiceOrb({ state, onStart, onStop }: VoiceOrbProps) {
  // Configuración de colores e iconos según estado
  const getStateConfig = () => {
    switch (state) {
      case "listening":
        return {
          color: "bg-blue-500",
          shadow: "shadow-blue-500/50",
          icon: <Mic className="w-8 h-8 text-white" />,
          text: "Listening...",
          subtext: "Speak clearly now",
        };
      case "thinking":
        return {
          color: "bg-purple-600",
          shadow: "shadow-purple-600/50",
          icon: <BrainCircuit className="w-8 h-8 text-white" />,
          text: "Thinking...",
          subtext: "Analyzing your grammar...",
        };
      case "speaking":
        return {
          color: "bg-emerald-500",
          shadow: "shadow-emerald-500/50",
          icon: <Volume2 className="w-8 h-8 text-white" />,
          text: "Speaking...",
          subtext: "Listen carefully",
        };
      case "error":
        return {
          color: "bg-red-500",
          shadow: "shadow-red-500/50",
          icon: <Zap className="w-8 h-8 text-white" />,
          text: "Connection Error",
          subtext: "Please refresh or try again",
        };
      default: // idle
        return {
          color: "bg-gray-800",
          shadow: "shadow-gray-800/50",
          icon: <Mic className="w-8 h-8 text-white" />,
          text: "The Language School",
          subtext: "Tap start to begin Lesson 1",
        };
    }
  };

  const config = getStateConfig();
  const isActive = state !== "idle" && state !== "error";

  return (
    <div className="flex flex-col items-center justify-center space-y-12 py-10 w-full max-w-sm mx-auto">
      {/* 1. EL ORBE (ANIMACIONES) */}
      <div className="relative flex items-center justify-center">
        {/* Anillo de "Respiración" (Solo activo) */}
        {isActive && (
          <motion.div
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 2.5, opacity: 0 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut",
            }}
            className={`absolute w-24 h-24 rounded-full ${config.color} opacity-20`}
          />
        )}

        {/* Anillo Secundario (Thinking) */}
        {state === "thinking" && (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute w-32 h-32 border-2 border-purple-300 border-t-transparent rounded-full opacity-60"
          />
        )}

        {/* Núcleo Central */}
        <motion.div
          animate={{
            scale: state === "listening" ? [1, 1.1, 1] : 1,
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-colors duration-500 ${config.color} ${config.shadow}`}
        >
          {config.icon}
        </motion.div>
      </div>

      {/* 2. TEXTOS DE ESTADO */}
      <div className="text-center space-y-2 h-16">
        <motion.h2
          key={config.text}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-gray-800"
        >
          {config.text}
        </motion.h2>
        <motion.p
          key={config.subtext}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-gray-500 text-sm font-medium"
        >
          {config.subtext}
        </motion.p>
      </div>

      {/* 3. BOTONES DE ACCIÓN */}
      <div className="pt-4 w-full px-8">
        {isActive ? (
          <button
            onClick={onStop}
            className="w-full flex items-center justify-center space-x-2 px-6 py-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-colors font-semibold border border-red-100"
          >
            <Square className="w-5 h-5 fill-current" />
            <span>End Session</span>
          </button>
        ) : (
          <button
            onClick={onStart}
            className="w-full px-8 py-4 bg-black text-white rounded-2xl hover:bg-gray-800 transition-transform active:scale-95 font-bold text-lg shadow-xl flex items-center justify-center space-x-2"
          >
            <Mic className="w-5 h-5" />
            <span>Start Conversation</span>
          </button>
        )}
      </div>
    </div>
  );
}
