# AI Wallet - Gestión Financiera Inteligente v2.5

Una aplicación web profesional de wallet con IA integrada, autenticación de usuarios, y persistencia en base de datos para gestión financiera automatizada.

## 🚀 Características Principales

### 🤖 IA Inteligente
- **Chat con IA**: Describe tus gastos en lenguaje natural y la IA los categoriza automáticamente
- **Múltiples transacciones**: Procesa varios gastos en un solo mensaje
- **Jerga Argentina**: Entiende "lucas", "palos", "mangos", etc.
- **Doble procesamiento**: IA real (Groq API) + Patrones fijos (fallback)

### 🎤 Voz (Speech-to-Text)
- **Whisper-1 de OpenAI**: Transcripción precisa en español
- **Grabación intuitiva**: MediaRecorder API con UI responsivo
- **Procesamiento automático**: Texto transcrito se inserta en el chat
- **Estados visuales**: Indicadores de grabación, transcripción y errores

### 🎨 UX Profesional (Vercel Style)
- **Modo Oscuro Elegante**: Fondo gris casi negro con acentos esmeralda
- **Actionable Cards**: Tarjetas interactivas con botones de deshacer
- **Glassmorphism**: Efectos de blur y transparencias
- **Animaciones Suaves**: Micro-interacciones y feedback visual
- **Dashboard Moderno**: Cards con bordes redondeados y efectos neón

### 💾 Persistencia Robusta
- **Supabase**: Base de datos PostgreSQL en la nube
- **Autenticación**: Sistema de usuarios con Auth de Supabase
- **Sincronización**: Datos sincronizados en tiempo real
- **Estructura fija**: Categorías predefinidas para consistencia

### 📊 Visualización Avanzada
- **Agrupación por fecha**: "Hoy", "Ayer", "Lunes 25", etc.
- **Dashboard en tiempo real**: Balance, ingresos, gastos
- **Transacciones pendientes**: Confirmación automática en 3 segundos
- **Historial completo**: Todas las transacciones organizadas por usuario

## 🛠️ Stack Tecnológico

### Frontend (TypeScript 94.1%)
- **Next.js 14** con App Router
- **React 18** con TypeScript
- **Tailwind CSS** con configuración personalizada
- **Lucide React** para iconos
- **Chart.js** para visualizaciones

### Backend & Base de Datos (PL/pgSQL 4.8%)
- **Supabase**: PostgreSQL + Auth + Realtime
- **API Routes**: Next.js API routes para procesamiento seguro
- **Groq API**: IA rápida para categorización
- **OpenAI Whisper**: Transcripción de audio

### Arquitectura
- **Estructura de tipos**: Tipos centralizados y reutilizables
- **Hooks personalizados**: Custom hooks para lógica compartida
- **Componentes UI**: Componentes reutilizables y escalables
- **RLS Policies**: Row-Level Security en Supabase

## 📦 Instalación

1. **Clonar el repositorio:**
```bash
git clone https://github.com/Fermin2107/ai-wallet.git
cd ai-wallet
```

2. **Instalar dependencias:**
```bash
npm install
```

3. **Configurar variables de entorno:**
```bash
cp .env.example .env.local
```

Editar `.env.local` con:
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=tu_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key

# IA
OPENAI_API_KEY=sk-your-api-key-here
GROQ_API_KEY=tu_groq_key

# Aplicación
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. **Ejecutar en desarrollo:**
```bash
npm run dev
```

5. **Abrir [http://localhost:3000](http://localhost:3000)**

## 🎯 Cómo Usar

### Chat con IA
```
"Gasté $500 en supermercado y $200 en ropa, y gané $5000 de sueldo"
"Me tiré $200 en birra y $100 en cine"
"Gané 2 palos del laburo y 50 lucas de freelance"
```

### Comandos de Voz
```
🎤 "Ayer gasté cinco mil pesos en el súper"
🎤 "El lunes pasado pagué el alquiler de treinta mil"
🎤 "Guardá diez mil para vacaciones"
```

### Características UX
- **Input protagonista**: Chat fijo en la parte inferior
- **Confirmación automática**: 3 segundos para deshacer
- **Cards interactivas**: Hover effects y botones de acción
- **Agrupación inteligente**: Transacciones agrupadas por fecha
- **Voz integrada**: Botón de micrófono para transcripción

## 🏗️ Arquitectura

### Estructura de Datos

#### Tabla: Transacciones
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  fecha DATE NOT NULL,
  monto DECIMAL(12, 2) NOT NULL,
  descripcion TEXT,
  categoria VARCHAR(50) NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('gasto', 'ingreso')),
  confirmado BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Tabla: Categorías
```sql
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  nombre VARCHAR(50) NOT NULL,
  tipo VARCHAR(10) NOT NULL,
  icono VARCHAR(20),
  color VARCHAR(20)
);
```

### Categorías Predefinidas

**Gastos:**
- Alimentación 🍔
- Transporte 🚗
- Servicios 💡
- Ocio 🎮
- Salud 🏥
- Compras 🛍️
- Educación 📚
- Hogar 🏠
- Otros 📦

**Ingresos:**
- Sueldo 💼
- Freelance 💻
- Inversiones 📈
- Negocio 🏪
- Regalo 🎁

### Componentes Principales
- `DashboardCards`: Resumen financiero visual
- `TransactionCard`: Tarjeta de transacción individual
- `AICard`: Tarjeta de confirmación con IA
- `ChatInput`: Input de chat con micrófono integrado
- `ChatInputWithVoice`: Componente con Whisper integrado
- `TransactionList`: Lista de transacciones agrupada

## 🎤 Funcionalidad de Voz

### Características
- **Transcripción en tiempo real**: Whisper API de OpenAI
- **Idioma**: Español automático
- **MediaRecorder API**: Grabación nativa del navegador
- **Estados visuales**: Indicadores de grabación y transcripción

### Flujo de Uso
1. Click en micrófono → Solicita permisos
2. Grabación → Botón rojo pulsando
3. Detener → Procesa audio automáticamente
4. Transcripción → Whisper convierte a texto
5. Inserción → Texto aparece en el input
6. Envío → Usuario puede editar y enviar

Ver [VOICE_FEATURES.md](./VOICE_FEATURES.md) para más detalles.

## 🚀 Mejoras Implementadas

### v2.5 - Integración Completa
- ✅ Supabase con autenticación de usuarios
- ✅ Sincronización en tiempo real
- ✅ RLS Policies para seguridad
- ✅ Voz con Whisper integrado
- ✅ UI mejorada con animaciones

### v2.0 - Rediseño Profesional
- ✅ Modo oscuro elegante con acentos esmeralda
- ✅ Actionable Cards con botones de deshacer
- ✅ Dashboard con efectos neón
- ✅ Persistencia con localStorage
- ✅ Agrupación por fecha inteligente

### v1.5 - IA Real
- ✅ Integración con IA (Groq)
- ✅ API route segura
- ✅ Procesamiento múltiple mejorado

### v1.0 - MVP
- ✅ Chat básico con NLP
- ✅ Dashboard simple
- ✅ Categorización automática

## 🚧 Roadmap Futuro

### v2.6 - Features Avanzadas
- [ ] Modo claro/oscuro toggle
- [ ] Exportación de datos (CSV, PDF)
- [ ] Búsqueda y filtros avanzados
- [ ] Estadísticas y análisis predictivo
- [ ] Presupuestos y metas

### v3.0 - Integraciones
- [ ] Conexión con APIs bancarias
- [ ] Notificaciones push
- [ ] Sincronización multi-dispositivo
- [ ] Colaboración familiar

### v4.0 - Multiplataforma
- [ ] App móvil (React Native)
- [ ] PWA con soporte offline
- [ ] Desktop app (Electron)

## 📊 Composición del Código

- **TypeScript**: 94.1% - Lógica de aplicación y componentes
- **PL/pgSQL**: 4.8% - Esquema y políticas de base de datos
- **Otros**: 1.1% - Configuración y assets

## 🧪 Testing

### Casos de Prueba
1. Registrar transacción por texto
2. Registrar transacción por voz
3. Múltiples transacciones en un mensaje
4. Categorización automática
5. Deshacer transacción
6. Exportar datos

## 📄 Licencia

MIT License - Libre para usar, modificar y distribuir

---

**Desarrollado con ❤️ por [Fermin2107](https://github.com/Fermin2107)**