import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    console.log('🎤 Recibiendo solicitud de transcripción de audio...');

    // Validar que tengamos API key
    if (!process.env.GROQ_API_KEY) {
      console.error('❌ Groq API key no configurada');
      return NextResponse.json(
        { error: 'Groq API key no configurada' },
        { status: 500 }
      );
    }

    // Extraer el archivo de audio del FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error('❌ No se encontró archivo de audio en FormData');
      return NextResponse.json(
        { error: 'No se encontró archivo de audio en el FormData' },
        { status: 400 }
      );
    }

    // Validación estricta de tamaño - rechazar archivos vacíos/corruptos
    if (file.size < 1000) {
      console.error(`🚨 Archivo demasiado pequeño (${file.size} bytes). Rechazando.`);
      return NextResponse.json({ error: "No se detectó voz. El audio está vacío." }, { status: 400 });
    }

    console.log('🎙️ Recibiendo audio:', file.name, 'Tipo:', file.type, 'Tamaño:', file.size);

    try {
      console.log('📝 Enviando a Groq Whisper API...');

      // Enviar a Groq para transcripción
      const transcription = await groq.audio.transcriptions.create({
        file: file,
        model: "whisper-large-v3-turbo",
        language: "es",
        response_format: "json",
      });

      console.log('✅ Transcripción completada exitosamente:', transcription.text);

      // Devolver el texto transcrito
      return NextResponse.json({
        text: transcription.text
      });

    } catch (error) {
      console.error('🚨 ERROR FATAL EN GROQ:', {
        error: error instanceof Error ? error.message : 'Error desconocido',
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error,
        name: error instanceof Error ? error.name : undefined
      });
      
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      
      return NextResponse.json(
        { 
          error: 'Error procesando la transcripción con Groq',
          details: errorMessage
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('💥 Error en API de transcripción:', error);
    return NextResponse.json(
      { 
        error: 'Error procesando la solicitud',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}
