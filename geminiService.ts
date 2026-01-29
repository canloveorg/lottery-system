import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateCelebrationMessage = async (winnerName: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `你現在是一位充滿喜氣的春節主持人。請為中獎者「${winnerName}」寫一段簡短、喜慶、充滿過年氛圍的吉祥話恭喜語。必須包含新年祝賀與對這位中獎者的讚美。字數在30字以內。`,
    });
    return response.text || `祝 ${winnerName} 龍年大吉，萬事如意，好運龍總來！`;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return `祝 ${winnerName} 恭喜發財，紅包拿來，歲歲平安！`;
  }
};
