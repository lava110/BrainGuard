
export enum WeatherStatus {
  SUNNY = 'SUNNY', // Normal
  CLOUDY = 'CLOUDY', // Warning
  STORM = 'STORM', // Danger
}

export interface MetricResult {
  score: number; // 0-100, 100 is best
  details: string;
  timestamp: number;
  raw?: any; // Store raw data for baseline comparison
}

export interface BaselineData {
  visual?: { eyeSym: number; mouthSym: number; browSym?: number };
  audio?: { pace: number; clarity: number }; // pace: chars/sec, clarity: 0-1
  touch?: { tapCount: number; armStability: number }; // tapCount: taps/10s, armStability: max angle deviation
  timestamp: number;
}

export interface EmergencyContact {
  name: string; // e.g. "儿子", "李医生"
  phone: string;
  autoShare: boolean; // placeholder for future automation
}

export interface UserHealthState {
  visual: MetricResult | null;
  audio: MetricResult | null;
  touch: MetricResult | null;
}

export interface DailyReport {
  status: WeatherStatus;
  aiAnalysis: string;
  generatedAt: string;
}

export type ModuleType = 'DASHBOARD' | 'MIRROR' | 'VOICE' | 'TOUCH' | 'CALIBRATION' | 'PROFILE';
