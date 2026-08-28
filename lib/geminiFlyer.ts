// Obsolète : on utilise Mistral AI (Pixtral), pas Gemini.
// Ce fichier ne sert plus qu'à ré-exporter la nouvelle implémentation
// (impossible de le supprimer dans cet environnement).
export {
  analyzeFlyer,
  analyzeFlyer as analyzeFlyerWithGemini,
  mistralConfigured,
  mistralConfigured as geminiConfigured,
  pingMistral,
  type FlyerAnalysis,
} from './flyerAI';
