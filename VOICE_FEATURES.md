# 🎤 Funcionalidad de Voz - AI Wallet

## 📋 Descripción General

Se ha implementado la funcionalidad de Speech-to-Text utilizando el modelo **Whisper-1** de OpenAI, permitiendo a los usuarios registrar transacciones y comandos mediante voz natural.

## 🏗️ Arquitectura Implementada

### Backend (API)
- **Nueva ruta**: `/api/transcribe/route.ts`
- **Modelo**: Whisper-1 de OpenAI
- **Formato**: Recibe FormData con archivo de audio
- **Idioma**: Español por defecto
- **Respuesta**: JSON con texto transcrito

### Frontend (Componente)
- **Componente**: `ChatInputWithVoice.tsx`
- **API Nativa**: MediaRecorder API del navegador
- **Estados**: `isRecording`, `isTranscribing`
- **Formato**: Audio WebM con códec Opus
- **UI**: Botón de micrófono con animaciones y estados

## 🎮 Flujo de Usuario

1. **Click en micrófono** → Solicitar permisos de audio
2. **Grabación** → Botón rojo pulsando con animación
3. **Detener grabación** → Procesar audio automáticamente
4. **Transcripción** → Enviar a API de Whisper
5. **Resultado** → Texto insertado en input del chat
6. **Envío** → Usuario puede editar y enviar mensaje

## 🔧 Características Técnicas

### Backend
```typescript
// /api/transcribe/route.ts
- Validación de API key de OpenAI
- Procesamiento de FormData
- Configuración de Whisper (idioma español)
- Manejo de errores y respuestas JSON
```

### Frontend
```typescript
// ChatInputWithVoice.tsx
- MediaRecorder API con configuración óptima
- Cancelación de eco y supresión de ruido
- Estados reactivos con UI feedback
- Manejo de permisos de micrófono
- Limpieza automática de recursos
```

## 🎨 Experiencia de Usuario

### Estados Visuales
- **🎤 Micrófono gris**: Listo para grabar
- **🔴 Micrófono rojo pulsando**: Grabando activo
- **⏹️ Micrófono con tachado**: Deteniendo grabación
- **🔄 Loader**: Transcribiendo audio

### Feedback Visual
- **Indicador de grabación**: Barra superior con "Grabando..."
- **Animación de pulso**: Botón rojo con efecto pulsante
- **Loader de transcripción**: Spinner con "Transcribiendo..."
- **Inserción automática**: Texto aparece en input al completar

## 🛡️ Manejo de Errores

### Permisos de Micrófono
- Alerta amigable si no se conceden permisos
- Explicación clara de cómo habilitar

### Errores de API
- Manejo de timeouts de Whisper
- Feedback específico de errores
- Opción de reintentar grabación

### Límites del Navegador
- Detección de soporte MediaRecorder
- Fallback a texto si no hay soporte
- Limpiado de streams al desmontar

## 🚀 Casos de Uso

### Comandos de Voz
```
🎤 "Ayer gasté cinco mil pesos en el súper"
🎤 "El lunes pasado pagué el alquiler de treinta mil"
🎤 "Guardá diez mil para vacaciones"
🎤 "Creá una meta para un auto nuevo de quinientos mil"
```

### Ventajas
- **Hands-free**: Registrar gastos mientras cocinas o manejas
- **Rápido**: Más rápido que escribir para comandos largos
- **Natural**: Hablás en español normal
- **Accesible**: Ayuda a usuarios con dificultades de escritura

## 🔧 Configuración y Requisitos

### Dependencias
```json
{
  "openai": "^4.104.0",  // Whisper API
  "lucide-react": "^0.294.0" // Iconos Mic/MicOff
}
```

### Permisos del Navegador
- `microphone`: Acceso al micrófono para grabación
- Los usuarios deben conceder permiso en primer uso

### Variables de Entorno
```bash
OPENAI_API_KEY=tu_api_key_aqui
```

## 🎯 Próximas Mejoras (Opcional)

1. **Detección de idioma automática**
2. **Soporte para comandos de voz continuos**
3. **Atajos de voz personalizados**
4. **Feedback de transcripción en tiempo real**
5. **Modo de dictado continuo**

## 🧪 Testing

### Casos de Prueba
1. **Grabar mensaje corto**: "Gasté mil pesos"
2. **Grabar mensaje largo**: "Ayer fui al supermercado y gasté quince mil pesos en verduras, cinco mil en carnes y dos mil en lácteos"
3. **Cancelar grabación**: Iniciar y detener rápidamente
4. **Múltiples grabaciones**: Grabar, enviar, grabar nuevamente
5. **Error de permisos**: Denegar permiso de micrófono

### Resultados Esperados
- Transcripción precisa en español
- Inserción correcta en el input
- Estados visuales consistentes
- Manejo elegante de errores

---

**¡La funcionalidad de voz transforma completamente la experiencia de uso de la AI Wallet!** 🎤✨
