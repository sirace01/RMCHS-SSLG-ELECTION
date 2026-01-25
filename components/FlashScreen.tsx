import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Voter, Branding } from '../types';

interface FlashScreenProps {
  voter?: Voter | null;
  mode: 'voter' | 'admin' | 'logout';
  onComplete: () => void;
  branding: Branding;
}

const FlashScreen: React.FC<FlashScreenProps> = ({ voter, mode, onComplete, branding }) => {
  useEffect(() => {
    const duration = mode === 'logout' ? 2500 : 3500;
    const timer = setTimeout(() => {
      onComplete();
    }, duration);

    return () => clearTimeout(timer);
  }, [onComplete, mode]);

  let title = "WELCOME";
  let subtitle = "";
  let subtext = "";
  let loadingText = "Loading...";
  let accentColor = "text-green-800";

  if (mode === 'voter' && voter) {
    title = "WELCOME";
    subtitle = `${voter.first_name} ${voter.last_name}`;
    subtext = `Grade ${voter.grade_level}`;
    loadingText = "Loading Ballot...";
  } else if (mode === 'admin') {
    title = "WELCOME";
    subtitle = "ADMINISTRATOR";
    subtext = "System Access Granted";
    loadingText = "Loading Dashboard...";
  } else if (mode === 'logout') {
    title = "SIGNING OUT";
    subtitle = voter ? `${voter.first_name}` : "Goodbye";
    subtext = "Thank you for using SSLG Voting System";
    loadingText = "Returning to Login...";
    accentColor = "text-slate-600";
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center overflow-hidden">
      <motion.div 
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 20, opacity: 0.05 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="absolute w-64 h-64 bg-green-500 rounded-full"
      />

      <div className="flex items-center gap-8 md:gap-16 z-10 relative">
        <motion.img
          initial={{ x: -100, opacity: 0, rotate: -45 }}
          animate={{ x: 0, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", bounce: 0.5, duration: 1.5 }}
          src={branding.school_logo_url}
          alt="School Logo"
          className="w-24 h-24 md:w-40 md:h-40 object-contain rounded-full drop-shadow-xl bg-white"
        />
        
        <motion.div 
          initial={{ scale: 0 }} 
          animate={{ scale: 1 }} 
          transition={{ delay: 0.5, type: 'spring' }}
          className="h-16 w-1 bg-gray-300 rounded-full"
        />

        <motion.img
          initial={{ x: 100, opacity: 0, rotate: 45 }}
          animate={{ x: 0, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", bounce: 0.5, duration: 1.5 }}
          src={branding.sslg_logo_url}
          alt="SSLG Logo"
          className="w-24 h-24 md:w-40 md:h-40 object-contain rounded-full drop-shadow-xl bg-white"
        />
      </div>

      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="mt-12 text-center z-10"
      >
        <h2 className={`text-3xl md:text-5xl font-black ${accentColor} tracking-tight uppercase`}>
          {title}
        </h2>
        <h3 className="text-xl md:text-2xl font-bold text-gray-700 mt-2">
          {subtitle}
        </h3>
        <p className="text-green-600 font-medium mt-1 uppercase tracking-wide">{subtext}</p>
        
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ delay: 1.5, duration: 1.5 }}
          className="h-1.5 bg-yellow-400 mt-6 mx-auto rounded-full max-w-[200px]"
        />
        <p className="text-gray-400 text-xs mt-2 uppercase tracking-widest">{loadingText}</p>
      </motion.div>
    </div>
  );
};

export default FlashScreen;