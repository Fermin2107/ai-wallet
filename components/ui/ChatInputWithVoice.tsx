'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Send, Mic, Loader2 } from 'lucide-react';

interface ChatInputWithVoiceProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export default function ChatInputWithVoice({ 
  onSendMessage, 
  isLoading, 
  placeholder = "Escribí tu mensaje...", 
  disabled = false 
}: ChatInputWithVoiceProps) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  const stopMediaStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = async () => {
    if (isRecording || isTranscribing || isProcessing || disabled) return;

    setIsProcessing(true);
    setIsRecording(true); // Set immediately to prevent race conditions
    
    try {
      console.log('🎤 Iniciando grabación de audio...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } 
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`📦 Chunk recibido: ${event.data.size} bytes`);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('⏹️ Grabación detenida');
        
        const totalSize = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
        console.log(`⏹️ Grabación terminada. Total chunks: ${audioChunksRef.current.length}, Total bytes: ${totalSize}`);

        if (totalSize < 1000) {
          alert('No se grabó nada. Hablá más claro o durante más tiempo.');
          audioChunksRef.current = [];
          setIsRecording(false);
          setIsProcessing(false);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        await transcribeAudio(audioBlob);
      };

      // Pedir chunks cada 500ms para asegurar datos continuos
      mediaRecorder.start(500);
      recordingStartTimeRef.current = Date.now();
      setIsProcessing(false);
      console.log('✅ Grabación iniciada correctamente');

    } catch (error) {
      console.error('❌ Error al iniciar grabación:', error);
      setIsRecording(false);
      setIsProcessing(false);
      alert('No se pudo acceder al micrófono. Verificá los permisos.');
    }
  };

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording) return;

    console.log(`🛑 Deteniendo grabación`);

    mediaRecorderRef.current.stop();
    setIsRecording(false);
    stopMediaStream();
  }, [isRecording, stopMediaStream]);

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      console.log(`📤 Enviando audio: ${audioBlob.size} bytes`);
      
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Error ${response.status}`);
      }

      if (result.text) {
        setMessage(result.text);
        console.log('✅ Transcripción:', result.text);
      }
    } catch (error) {
      console.error('❌ Error transcripción:', error);
      alert(`Error al transcribir: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const toggleRecording = () => {
    if (isProcessing) {
      console.log('🔄 Procesando en curso, ignorando click');
      return;
    }
    
    if (isRecording) {
      const duration = Date.now() - recordingStartTimeRef.current;
      if (duration < 500) {
        console.log(`⚠️ Grabación muy corta (${duration}ms), ignorando detención`);
        return;
      }
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled && !isLoading) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  React.useEffect(() => {
    return () => { stopRecording(); stopMediaStream(); };
  }, [stopRecording, stopMediaStream]);

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="flex items-center space-x-3">

        {/* Botón de grabación toggle */}
        <button
          type="button"
          onClick={toggleRecording}
          disabled={disabled || isTranscribing || isProcessing}
          className={`p-3 rounded-xl transition-all duration-200 select-none
            ${isRecording 
              ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/40' 
              : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            }
            ${isTranscribing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title={isRecording ? 'Click para detener grabación' : 'Click para empezar a grabar'}
        >
          {isTranscribing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>

        {/* Input de texto */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? '🔴 Grabando... click para detener' : placeholder}
            disabled={disabled || isLoading}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
          />
          {isTranscribing && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
              <span className="text-xs text-emerald-400">Transcribiendo...</span>
            </div>
          )}
        </div>

        {/* Botón enviar */}
        <button
          type="submit"
          disabled={!message.trim() || disabled || isLoading || isRecording || isTranscribing}
          className="p-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-200"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>

      {/* Indicador de grabación */}
      {isRecording && (
        <div className="absolute -top-8 left-0 right-0 flex justify-center">
          <div className="flex items-center space-x-2 bg-red-500/20 backdrop-blur-sm px-3 py-1 rounded-full">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-red-400 font-medium">Grabando... click para detener</span>
          </div>
        </div>
      )}
    </form>
  );
}
