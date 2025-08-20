import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// Definir las configuraciones de Firebase y la app ID
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Componente para mostrar mensajes de forma temporal
const MessageBox = ({ message, type }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (!visible) return null;

  const backgroundColor = type === 'success' ? '#10B981' : '#EF4444'; // Use Tailwind's colors directly

  return (
    <div style={{
      position: 'fixed',
      bottom: '2rem',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '1rem',
      borderRadius: '1rem',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      color: 'white',
      fontWeight: 'bold',
      textAlign: 'center',
      zIndex: 50,
      transition: 'transform 0.3s ease-in-out',
      backgroundColor: backgroundColor
    }}>
      {message}
    </div>
  );
};

// Componente principal de la aplicación
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [portfolio, setPortfolio] = useState({ usd: 0, eth: 0, botActive: false });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [analysisText, setAnalysisText] = useState('');
  const [threatText, setThreatText] = useState('');
  const [threatAnalysisText, setThreatAnalysisText] = useState('');

  // Inicializar Firebase y autenticar al usuario
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        const app = initializeApp(firebaseConfig);
        const firebaseAuth = getAuth(app);
        const firestoreDb = getFirestore(app);
        setAuth(firebaseAuth);
        setDb(firestoreDb);

        let userCred;
        if (initialAuthToken) {
          userCred = await signInWithCustomToken(firebaseAuth, initialAuthToken);
        } else {
          userCred = await signInAnonymously(firebaseAuth);
        }
        setUserId(userCred.user.uid);
        setIsAuthReady(true);
      } catch (error) {
        console.error("Error initializing Firebase:", error);
        showMessage("Error al conectar con la base de datos. Por favor, recarga la página.", "error");
      }
    };

    initializeFirebase();
  }, []);

  // Suscribirse a los cambios en Firestore
  useEffect(() => {
    if (isAuthReady && db && userId) {
      const userDocRef = doc(db, 'artifacts', appId, 'users', userId, 'data', 'portfolio');
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setPortfolio(docSnap.data());
        }
      }, (error) => {
        console.error("Error listening to Firestore changes:", error);
        showMessage("Error de conexión en tiempo real con la base de datos.", "error");
      });
      return () => unsubscribe();
    }
  }, [db, userId, isAuthReady]);

  // Función para mostrar mensajes temporales
  const showMessage = (text, type = 'success') => {
    setMessage(text);
    setMessageType(type);
  };

  // Guardar los datos del portafolio en Firestore
  const savePortfolio = async (updatedPortfolio) => {
    if (!db || !userId) return;
    try {
      const userDocRef = doc(db, 'artifacts', appId, 'users', userId, 'data', 'portfolio');
      await setDoc(userDocRef, updatedPortfolio);
    } catch (e) {
      console.error("Error al guardar el portafolio:", e);
      showMessage("No se pudo guardar la información. Por favor, inténtalo de nuevo.", "error");
    }
  };

  // Calcular el valor total del portafolio
  const totalValue = (portfolio.usd || 0) + ((portfolio.eth || 0) * 2000);

  // Manejar el cambio de los inputs del portafolio
  const handlePortfolioChange = (e) => {
    const { name, value } = e.target;
    const updatedPortfolio = { ...portfolio, [name]: parseFloat(value) || 0 };
    setPortfolio(updatedPortfolio);
    savePortfolio(updatedPortfolio);
  };

  // Manejar el botón para iniciar/detener el bot
  const handleBotToggle = async () => {
    const updatedPortfolio = { ...portfolio, botActive: !portfolio.botActive };
    setPortfolio(updatedPortfolio);
    await savePortfolio(updatedPortfolio);
    showMessage(`Bot de IA ${updatedPortfolio.botActive ? 'iniciado' : 'detenido'}.`, 'success');
  };

  // Analizar el portafolio con la API de Gemini
  const handleAnalyze = async () => {
    setAnalysisText('Analizando el portafolio y el mercado. Esto puede tomar unos segundos...');
    
    const prompt = `Analiza el siguiente portafolio de criptomonedas y ofrece una estrategia de trading y una predicción del mercado.
        Portafolio:
        - USD: ${portfolio.usd}
        - ETH: ${portfolio.eth}
        - Estado del bot: ${portfolio.botActive ? 'activo' : 'inactivo'}.
        - El análisis debe ser breve y conciso, en español, y adecuado para un usuario principiante.
        - Formato de respuesta: "Análisis: [Tu análisis]. Estrategia sugerida: [Tu estrategia]."
    `;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=`;
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    };

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      setAnalysisText(result.candidates[0].content.parts[0].text);
    } catch (error) {
      console.error('Error al llamar a la API de Gemini:', error);
      setAnalysisText('Error al obtener el análisis. Por favor, inténtalo de nuevo.');
      showMessage("Error en el análisis de IA.", "error");
    }
  };

  // Analizar amenazas con la API de Gemini
  const handleThreatAnalyze = async () => {
    if (!threatText.trim()) {
      showMessage("Por favor, introduce un texto o un contrato para analizar.", "error");
      return;
    }

    setThreatAnalysisText('Analizando el texto en busca de posibles amenazas o vulnerabilidades...');
    
    const prompt = `Analiza el siguiente texto o fragmento de código para identificar posibles amenazas, vulnerabilidades de seguridad, o malas prácticas en el contexto de contratos inteligentes o seguridad informática.
        Texto: "${threatText}"
        - El análisis debe ser breve y conciso, en español.
        - Si no hay amenazas evidentes, responde con un mensaje de seguridad.
        - Formato de respuesta: "Resultado: [Tu análisis]. Recomendación: [Tu recomendación]."
    `;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=`;
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    };

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      setThreatAnalysisText(result.candidates[0].content.parts[0].text);
    } catch (error) {
      console.error('Error al llamar a la API de Gemini:', error);
      setThreatAnalysisText('Error al obtener el análisis de amenazas. Por favor, inténtalo de nuevo.');
      showMessage("Error en el análisis de amenazas.", "error");
    }
  };

  return (
    <div style={{ backgroundColor: '#E6F0E0' }} className="flex flex-col items-center justify-center p-6 min-h-screen font-inter">
      <div id="app-container" style={{ backgroundColor: '#F3F4F6' }} className="w-full max-w-4xl p-8 rounded-2xl shadow-xl flex flex-col space-y-8">
        {/* Header and logo */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-6">
          <h1 style={{ color: '#4B5563' }} className="text-4xl font-bold mb-4 md:mb-0">DeFi Guardian</h1>
          <nav className="flex space-x-4">
            <a href="#" style={{ color: '#4B5563' }} className="hover:text-green-600 transition-colors">Inicio</a>
            <a href="#" style={{ color: '#4B5563' }} className="hover:text-green-600 transition-colors">Análisis de la IA</a>
            <a href="#" style={{ color: '#4B5563' }} className="hover:text-green-600 transition-colors">Soporte</a>
            <a href="#" style={{ color: '#4B5563' }} className="hover:text-green-600 transition-colors">Log In</a>
            <a href="#" style={{ backgroundColor: '#4CAF50', color: 'white' }} className="px-4 py-2 rounded-full hover:bg-green-700 transition-colors">Registrar</a>
          </nav>
        </header>

        {/* Welcome section */}
        <section style={{ backgroundColor: 'white', color: '#4B5563' }} className="p-6 rounded-2xl shadow-md">
          <h2 className="text-xl font-semibold mb-2">
            ¿No estás seguro de qué camino tomar?
          </h2>
          <p className="text-sm text-gray-600">
            Nuestro sistema de IA analiza constantemente el mercado y te sugiere estrategias de trading adaptadas a tus objetivos y tolerancia al riesgo. Toma decisiones más inteligentes con el respaldo de datos y algoritmos avanzados.
          </p>
        </section>

        {/* Main bot and portfolio container */}
        <div className="flex flex-col md:flex-row space-y-8 md:space-y-0 md:space-x-8">
          {/* AI Bot control section */}
          <section style={{ backgroundColor: 'white', color: '#4B5563' }} className="flex-1 p-6 rounded-2xl shadow-md flex flex-col space-y-4">
            <h3 className="text-lg font-semibold">DeFi Guardian</h3>
            <button onClick={handleBotToggle} style={{ backgroundColor: '#4CAF50', color: 'white' }} className="font-bold py-3 rounded-full hover:bg-green-700 transition-colors">
              {portfolio.botActive ? 'Detener Bot' : 'Iniciar Bot'}
            </button>
          </section>

          {/* Portfolio status section */}
          <section style={{ backgroundColor: 'white', color: '#4B5563' }} className="flex-1 p-6 rounded-2xl shadow-md flex flex-col space-y-4">
            <h3 className="text-lg font-semibold">Estado del Portafolio</h3>
            <div className="flex flex-col space-y-2">
              <div className="flex items-center space-x-2">
                <label htmlFor="usd-input" className="text-gray-600">USD</label>
                <input
                  type="number"
                  name="usd"
                  id="usd-input"
                  value={portfolio.usd}
                  onChange={handlePortfolioChange}
                  style={{ borderColor: '#D1D5DB' }}
                  className="flex-1 p-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
                />
              </div>
              <div className="flex items-center space-x-2">
                <label htmlFor="eth-input" className="text-gray-600">ETH</label>
                <input
                  type="number"
                  name="eth"
                  id="eth-input"
                  value={portfolio.eth}
                  onChange={handlePortfolioChange}
                  style={{ borderColor: '#D1D5DB' }}
                  className="flex-1 p-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-col items-center">
              <span style={{ color: '#4B5563' }} className="text-2xl font-bold">Valor total (USD): ${totalValue.toFixed(2)}</span>
            </div>
          </section>
        </div>

        {/* AI analysis and report generation section */}
        <div className="flex flex-col md:flex-row space-y-8 md:space-y-0 md:space-x-8">
          <section style={{ backgroundColor: 'white', color: '#4B5563' }} className="flex-1 p-6 rounded-2xl shadow-md flex flex-col space-y-4">
            <h3 className="text-lg font-semibold">Análisis de la IA</h3>
            <button onClick={handleAnalyze} style={{ backgroundColor: '#4CAF50', color: 'white' }} className="font-bold py-3 rounded-full hover:bg-green-700 transition-colors">
              Análisis de la IA
            </button>
            {analysisText && (
              <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
                <p className="text-sm text-gray-700">{analysisText}</p>
              </div>
            )}
            <button style={{ backgroundColor: '#E5E7EB', color: '#4B5563' }} className="font-bold py-3 rounded-full hover:bg-gray-300 transition-colors">
              Aprende DeFi
            </button>
          </section>

          {/* Threat analysis section */}
          <section style={{ backgroundColor: 'white', color: '#4B5563' }} className="flex-1 p-6 rounded-2xl shadow-md flex flex-col space-y-4">
            <h3 className="text-lg font-semibold">Análisis de amenazas</h3>
            <p className="text-sm text-gray-600">
              Añade un texto o un contrato para una evaluación de seguridad.
            </p>
            <textarea
              rows="4"
              value={threatText}
              onChange={(e) => setThreatText(e.target.value)}
              style={{ borderColor: '#D1D5DB' }}
              className="p-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#4CAF50]"
            ></textarea>
            <button onClick={handleThreatAnalyze} style={{ backgroundColor: '#4CAF50', color: 'white' }} className="font-bold py-3 rounded-full hover:bg-green-700 transition-colors">
              Analizar amenaza
            </button>
            {threatAnalysisText && (
              <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
                <p className="text-sm text-gray-700">{threatAnalysisText}</p>
              </div>
            )}
          </section>
        </div>
        
      </div>
      <MessageBox message={message} type={messageType} />
    </div>
  );
};

export default App;
