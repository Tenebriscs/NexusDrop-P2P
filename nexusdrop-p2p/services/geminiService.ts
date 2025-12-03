import { GoogleGenAI } from "@google/genai";

const AI_KEY = process.env.API_KEY || '';

export const generateFileSummary = async (file: File): Promise<string | null> => {
  if (!AI_KEY) {
    console.warn("No API Key found for Gemini analysis.");
    return null;
  }

  // Only analyze text-based files or small images to avoid huge payloads
  const isText = file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.json');
  
  if (!isText) {
    return "Binary file (Preview unavailable)";
  }

  try {
    const ai = new GoogleGenAI({ apiKey: AI_KEY });
    
    // Read first 5KB for summary to save tokens and time
    const textContent = await readFileSlice(file, 0, 5000);
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze this file snippet and provide a one-sentence summary describing what kind of data it contains. 
      File Name: ${file.name}. 
      Content Snippet: ${textContent}`,
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return null;
  }
};

const readFileSlice = (file: File, start: number, end: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const slice = file.slice(start, end);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(slice);
  });
};