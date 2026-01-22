import { GoogleGenAI } from "@google/genai";
import { UserHealthState, WeatherStatus, BaselineData } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const generateHealthReport = async (
    healthState: UserHealthState, 
    baseline: BaselineData | null,
    historyAvg: number
): Promise<{ text: string, status: WeatherStatus }> => {
  const ai = getAIClient();
  
  // Extract scores
  const validScores: number[] = [];
  if (healthState.visual?.score !== undefined) validScores.push(healthState.visual.score);
  if (healthState.audio?.score !== undefined) validScores.push(healthState.audio.score);
  if (healthState.touch?.score !== undefined) validScores.push(healthState.touch.score);
  
  // If no tests performed yet
  if (validScores.length === 0) {
      return { text: "请点击下方模块，开始今天的健康检测。", status: WeatherStatus.SUNNY };
  }

  // Calculate Average
  let currentAvg = Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length);
  if (isNaN(currentAvg)) currentAvg = 0; 
  
  // CRITICAL LOGIC: Lowest Score Determination
  const lowestScore = Math.min(...validScores);
  const criticalIssue = lowestScore < 60;

  // Determine trend relative to baseline
  let baselineContext = "用户尚未建立基准线。";
  let improvementContext = "";
  
  if (baseline) {
      baselineContext = "用户已建立个人基准线。";
      if (currentAvg >= 90) {
          improvementContext = "当前表现极佳，优于或持平于理想基准。";
      } else if (historyAvg > 0 && currentAvg > historyAvg + 5) {
          improvementContext = `对比过去7天均分(${historyAvg}分)，今日有明显进步。`;
      }
  }

  const formatScore = (val: number | undefined) => val !== undefined ? `${val}分` : "未检测";

  // Mock response if no key (Demo Mode)
  if (!ai) {
    let mockText = "您的各项指标看起来很稳定。";
    let mockStatus = WeatherStatus.SUNNY;

    if (criticalIssue) {
        mockText = "检测到某个项目分数明显异常，请注意身体变化，必要时联系医生。";
        mockStatus = WeatherStatus.STORM;
    } else if (currentAvg < 80) {
        mockText = "今天的状态一般，请多休息。";
        mockStatus = WeatherStatus.CLOUDY;
    } else if (currentAvg > 90) {
        mockText = "太棒了！您的状态表现出色，继续保持！";
    }

    return {
      text: `(演示模式) ${mockText} ${!criticalIssue && improvementContext ? "近期趋势向好。" : ""}`,
      status: mockStatus
    };
  }

  // Enhanced Prompt enforcing Critical Risk awareness
  const prompt = `
    你是一个名为“脑安 (BrainGuard)”的老年人健康助手。
    请根据以下数据生成一份简短的日报。

    【今日数据】:
    - 面部对称性: ${formatScore(healthState.visual?.score)}
    - 语音稳定性: ${formatScore(healthState.audio?.score)}
    - 运动控制: ${formatScore(healthState.touch?.score)} (若低于60分意味着可能有震颤或失控)
    - 平均分: ${currentAvg}
    - 最低分: ${lowestScore}

    【历史背景】:
    - 7日历史均分: ${historyAvg > 0 ? historyAvg : "无数据"}
    - ${baselineContext}

    请完成以下任务：
    1. 判定天气状态:
       - 只要有**任意一项**分数低于 60，必须返回 'STORM' (风险)。
       - 否则，若平均分 60-79，返回 'CLOUDY'。
       - 否则，返回 'SUNNY'。
    
    2. 生成中文健康建议（最多2句话）：
       - 语气温暖、像子女。
       - **关键逻辑**：如果最低分 < 60，不要理会平均分，必须直接警告该具体问题（如“检测到手臂有震颤现象”）。
       - 如果各项都好，则给予表扬。
    
    输出必须为 JSON 格式:
    {
      "status": "SUNNY" | "CLOUDY" | "STORM",
      "message": "中文建议字符串"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("Empty response");

    const result = JSON.parse(jsonText);
    
    let status = WeatherStatus.SUNNY;
    if (result.status === 'CLOUDY') status = WeatherStatus.CLOUDY;
    if (result.status === 'STORM') status = WeatherStatus.STORM;
    
    // Safety Net: Force STORM if logic missed it but score is critical
    if (criticalIssue) status = WeatherStatus.STORM;

    return {
      text: result.message,
      status: status
    };

  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      text: "数据分析服务连接中，请稍后...",
      status: WeatherStatus.CLOUDY
    };
  }
};

export const analyzeSpeechCoherence = async (transcript: string, targetText: string): Promise<{ score: number, reasoning: string }> => {
    const ai = getAIClient();
    
    if (!ai) {
        return { score: 85, reasoning: "演示模式：语义逻辑分析功能需配置 API Key。" };
    }

    const prompt = `
      作为中风评估专家，请对比用户朗读的语音识别文本与目标文本。
      目标文本: "${targetText}"
      用户语音转录: "${transcript}"

      请分析用户是否存在“失语症” (Aphasia) 或认知混乱的迹象。
      注意：语音识别可能有轻微误差，请忽略单纯的同音字错误，只关注逻辑和语义错误。

      返回 JSON:
      {
        "score": number, // 0-100, 100为逻辑完全清晰
        "reasoning": "简短中文分析"
      }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        
        const result = JSON.parse(response.text || "{}");
        return {
            score: result.score || 0,
            reasoning: result.reasoning || "无法分析语义"
        };
    } catch (e) {
        console.error("Speech Analysis Error", e);
        return { score: 80, reasoning: "AI 语义分析服务暂时不可用" };
    }
};