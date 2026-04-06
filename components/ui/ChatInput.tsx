'use client';

import React, { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSendMessage, isLoading = false, placeholder = "Ej: Gasté $500 en supermercado..." }: ChatInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-950/90 backdrop-blur-lg border-t border-gray-800 p-4 z-50">
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-50" />
            <div className="relative bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700 hover:border-gray-600 transition-all duration-300">
              <div className="flex items-center px-4 py-3">
                <Sparkles className="w-5 h-5 text-emerald-400 mr-3 flex-shrink-0" />
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={isLoading}
                  className="flex-1 bg-transparent text-white placeholder-gray-400 resize-none outline-none text-sm md:text-base min-h-[24px] max-h-32"
                  rows={1}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading}
                  className="ml-3 p-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          
          {/* Indicador de escritura */}
          {inputValue && (
            <div className="absolute -top-6 left-4 text-xs text-gray-500">
              Presiona Enter para enviar, Shift+Enter para nueva línea
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
