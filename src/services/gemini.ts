import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "YOUR_API_KEY_HERE";
const genAI = new GoogleGenerativeAI(API_KEY);

export async function getFinancialAdvice(context: string): Promise<string> {
    if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
        // Simulate API call delay for demo purposes if no key
        await new Promise(resolve => setTimeout(resolve, 1500));
        return "Market volatility is currently moderate. Considering your balanced risk profile, holding your current positions in Indian Equities while slowly accumulating ESG funds is recommended. (Mock AI Response - Add API Key for Real Logic)";
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const prompt = `You are an expert financial advisor AI for Indian salaried professionals.
    Context: ${context}
    Provide a concise, 2-sentence actionable piece of advice. Keep it professional and reassuring.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini API Error:", error);
        return "Unable to fetch live advice at the moment. Please stick to your long-term SIP strategy.";
    }
}
