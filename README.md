# AI Wallet - Gestión Financiera Inteligente v2.0

Una aplicación web de wallet con IA integrada y arquitectura profesional para gestión financiera automatizada.

## 🚀 Características Principales

### 🤖 IA Inteligente
- **Chat con IA**: Describe tus gastos en lenguaje natural y la IA los categoriza automáticamente
- **Múltiples transacciones**: Procesa varios gastos en un solo mensaje
- **Jerga Argentina**: Entiende "lucas", "palos", "mangos", etc.
- **Doble procesamiento**: IA real (OpenAI GPT-4) + Patrones fijos (fallback)

### 🎨 UX Profesional (Vercel Style)
- **Modo Oscuro Elegante**: Fondo gris casi negro con acentos esmeralda
- **Actionable Cards**: Tarjetas interactivas con botones de deshacer
- **Glassmorphism**: Efectos de blur y transparencias
- **Animaciones Suaves**: Micro-interacciones y feedback visual
- **Dashboard Moderno**: Cards con bordes redondeados y efectos neón

### 💾 Persistencia de Datos
- **localStorage**: Datos guardados localmente
- **Hook personalizado**: `useLocalStorage` para sincronización automática
- **Estructura fija**: Categorías predefinidas para consistencia

### 📊 Visualización Avanzada
- **Agrupación por fecha**: "Hoy", "Ayer", "Lunes 25", etc.
- **Dashboard en tiempo real**: Balance, ingresos, gastos
- **Transacciones pendientes**: Confirmación automática en 3 segundos
- **Historial completo**: Todas las transacciones organizadas

## 🛠️ Stack Tecnológico

### Frontend
- **Next.js 14** con App Router
- **React 18** con TypeScript
- **Tailwind CSS** con configuración personalizada
- **Lucide React** para iconos

### Arquitectura
- **Estructura de tipos**: `lib/types.ts` - Datos centralizados
- **Hooks personalizados**: `hooks/useLocalStorage.ts`
- **Componentes UI**: `components/ui/` - Reutilizables
- **Procesadores**: NLP, Multi-transacción, IA Real

### IA y Procesamiento
- **OpenAI GPT-4** (API route segura)
- **NLP con regex** (fallback)
- **Procesamiento múltiple** (varias transacciones)
- **Inferencia contextual** (agrega verbos cuando faltan)

## 📦 Instalación

1. **Clonar el repositorio:**
```bash
git clone <repository-url>
cd ai-wallet
```

2. **Instalar dependencias:**
```bash
npm install
```

3. **Configurar API Key (opcional):**
```bash
cp .env.local .env
# Editar .env con tu API key de OpenAI
OPENAI_API_KEY=sk-your-api-key-here
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

### Características UX
- **Input protagonista**: Chat fijo en la parte inferior
- **Confirmación automática**: 3 segundos para deshacer
- **Cards interactivas**: Hover effects y botones de acción
- **Agrupación inteligente**: Transacciones agrupadas por fecha

## 🏗️ Arquitectura

### Estructura de Datos
```typescript
interface Transaction {
  id: string;
  fecha: string; // '2024-03-31'
  monto: number;
  descripcion: string;
  categoria: Categoria;
  tipo: 'gasto' | 'ingreso';
  confirmado: boolean;
}
```

### Categorías Fijas
- **Gastos**: Alimentación 🍔, Transporte 🚗, Servicios 💡, Ocio 🎮, Salud 🏥, Compras 🛍️, Educación 📚, Hogar 🏠, Otros 📦
- **Ingresos**: Sueldo 💼, Freelance 💻, Inversiones 📈, Negocio 🏪, Regalo 🎁

### Componentes Principales
- `DashboardCards`: Resumen financiero visual
- `TransactionCard`: Tarjeta de transacción individual
- `AICard`: Tarjeta de confirmación con IA
- `ChatInput`: Input de chat con diseño protagonista

## 🚀 Mejoras Implementadas

### v2.0 - Rediseño Profesional
- ✅ Modo oscuro elegante con acentos esmeralda
- ✅ Actionable Cards con botones de deshacer
- ✅ Dashboard con efectos neón y glassmorphism
- ✅ Persistencia con localStorage
- ✅ Agrupación por fecha inteligente
- ✅ Input de chat protagonista
- ✅ Confirmación automática de transacciones
- ✅ Estructura de datos profesional
- ✅ Componentes UI reutilizables

### v1.5 - IA Real
- ✅ Integración con OpenAI GPT-4
- ✅ API route segura
- ✅ Toggle entre IA y patrones
- ✅ Procesamiento múltiple mejorado

### v1.0 - MVP
- ✅ Chat básico con NLP
- ✅ Dashboard simple
- ✅ Categorización automática

## 🚧 Roadmap Futuro

### v2.1 - Features Avanzadas
- [ ] Modo claro/oscuro toggle
- [ ] Exportación de datos (CSV, PDF)
- [ ] Búsqueda y filtros avanzados
- [ ] Estadísticas y análisis predictivo

### v2.2 - Integraciones
- [ ] Conexión con APIs bancarias
- [ ] Sincronización en la nube
- [ ] Notificaciones push
- [ ] Metas y presupuestos

### v3.0 - Multiplataforma
- [ ] App móvil (React Native)
- [ ] Autenticación de usuarios
- [ ] Cuentas múltiples
- [ ] Colaboración familiar

## 📄 Licencia

MIT License
