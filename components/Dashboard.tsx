import React, { useEffect, useState } from 'react';
import { UserHealthState, WeatherStatus, EmergencyContact, BaselineData } from '../types';
import { generateHealthReport } from '../services/geminiService';
import { getHistory7Days, HistoryRecord, getBaseline, getContact } from '../services/db';
import { Sun, CloudRain, CloudLightning, RefreshCw, ChevronRight, Scale, Phone, ShieldAlert, Share2, Send, TrendingUp, ScanFace, Mic, Hand, Check, Medal, Trophy, CalendarDays } from 'lucide-react';

interface Props {
  data: UserHealthState;
  onNavigate: (module: string) => void;
}

interface DayStatus {
  dateKey: string;
  dayLabel: string;
  isCompleted: boolean;
  score: number;
  isToday: boolean;
}

const Dashboard: React.FC<Props> = ({ data, onNavigate }) => {
  const [report, setReport] = useState<{status: WeatherStatus, text: string} | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Streak & Calendar State
  const [weekData, setWeekData] = useState<DayStatus[]>([]);
  const [streakCount, setStreakCount] = useState(0);

  const [hasBaseline, setHasBaseline] = useState(false);
  const [baselineData, setBaselineData] = useState<BaselineData | null>(null);
  const [contact, setContact] = useState<EmergencyContact | null>(null);
  const [isImproving, setIsImproving] = useState(false);

  // Calculate scores
  const validScores = [data.visual?.score, data.audio?.score, data.touch?.score].filter(s => s !== undefined) as number[];
  
  // LOGIC FIX: Critical Risk Detection (Wooden Barrel Theory)
  // If ANY single module is < 60 (Critical), the status must reflect this, even if average is high.
  const lowestScore = validScores.length > 0 ? Math.min(...validScores) : 100;
  const isCriticalRisk = lowestScore < 60;

  const todayScore = validScores.length > 0 
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) 
    : null;

  useEffect(() => {
    const baseline = getBaseline();
    setBaselineData(baseline);
    setHasBaseline(!!baseline);
    setContact(getContact());

    const loadData = async () => {
        const records = await getHistory7Days();
        // Calculate Streak & Calendar Data
        const { streakData, currentStreak, avgScore } = processHistoryForCalendar(records, data);
        setWeekData(streakData);
        setStreakCount(currentStreak);

        const currentScores = [data.visual?.score, data.audio?.score, data.touch?.score].filter(s => s !== undefined) as number[];
        if (currentScores.length > 0) {
            const currentAvg = currentScores.reduce((a, b) => a + b, 0) / currentScores.length;
            if (avgScore > 0 && currentAvg > avgScore + 5) {
                setIsImproving(true);
            }
        }

        if (data.visual || data.audio || data.touch) {
            setLoading(true);
            generateHealthReport(data, baseline, avgScore).then(res => {
                setReport(res);
                setLoading(false);
            });
        }
    };
    loadData();

  }, [data]);

  const processHistoryForCalendar = (records: HistoryRecord[], currentSessionData: UserHealthState) => {
    const daysMap = new Map<string, { total: number, count: number }>();
    const today = new Date();
    const todayKey = `${today.getMonth() + 1}.${today.getDate()}`;
    
    // 1. Aggregate DB data
    records.forEach(r => {
        const d = new Date(r.timestamp);
        const key = `${d.getMonth() + 1}.${d.getDate()}`;
        if (!daysMap.has(key)) daysMap.set(key, { total: 0, count: 0 });
        const entry = daysMap.get(key)!;
        entry.total += r.score;
        entry.count += 1;
    });

    // 2. Force Sync Today from Props (Live State)
    const currentScores = [
        currentSessionData.visual?.score, 
        currentSessionData.audio?.score, 
        currentSessionData.touch?.score
    ].filter(s => s !== undefined) as number[];

    if (currentScores.length > 0) {
        const liveTotal = currentScores.reduce((a,b) => a+b, 0);
        const liveCount = currentScores.length;
        daysMap.set(todayKey, { total: liveTotal, count: liveCount });
    }

    // 3. Build 7-Day Array
    const streakData: DayStatus[] = [];
    let grandTotal = 0;
    let grandCount = 0;

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = `${d.getMonth() + 1}.${d.getDate()}`;
        
        // Label logic: "今天", "昨天", or date
        let dayLabel = `${d.getMonth() + 1}.${d.getDate()}`;
        if (i === 0) dayLabel = '今天';
        else if (i === 1) dayLabel = '昨天';

        const entry = daysMap.get(key);
        const isCompleted = !!entry && entry.count > 0;
        const score = isCompleted ? Math.round(entry.total / entry.count) : 0;

        streakData.push({
            dateKey: key,
            dayLabel,
            isCompleted,
            score,
            isToday: i === 0
        });

        if (isCompleted && i !== 0) { // Exclude today from history avg calc to compare trend
             grandTotal += score;
             grandCount++;
        }
    }

    // 4. Calculate Streak
    // Logic: Count backwards. If today is done, count from today. If today not done, count from yesterday.
    let currentStreak = 0;
    const todayDone = streakData[6].isCompleted;
    const startIndex = todayDone ? 6 : 5;

    for (let i = startIndex; i >= 0; i--) {
        if (streakData[i].isCompleted) currentStreak++;
        else break;
    }

    const avgScore = grandCount > 0 ? Math.round(grandTotal / grandCount) : 0;
    return { streakData, currentStreak, avgScore };
  };

  const handleShare = (type: 'WEEKLY' | 'EMERGENCY') => {
      const text = type === 'EMERGENCY' 
        ? `【脑安紧急】${contact?.name || '家人'}，我不舒服，系统提示有风险。` 
        : `【脑安日报】${contact?.name || '家人'}，我已连续打卡${streakCount}天，今天评分：${todayScore || '未出'}分。`;

      if (navigator.share) {
          navigator.share({ title: '健康报告', text: text }).catch((err) => {
              if (err.name !== 'AbortError') console.error('Share failed:', err);
          });
      } else if (contact?.phone) {
          window.open(`sms:${contact.phone}?body=${encodeURIComponent(text)}`);
      } else {
          onNavigate('PROFILE');
      }
  };

  const getStatusIcon = (status: WeatherStatus) => {
    switch(status) {
        case WeatherStatus.SUNNY: return <Sun size={56} className="text-status-ok animate-pulse-slow" />;
        case WeatherStatus.CLOUDY: return <CloudRain size={56} className="text-status-warn" />;
        case WeatherStatus.STORM: return <CloudLightning size={56} className="text-status-danger animate-bounce" />;
        default: return <Sun size={56} className="text-warm-200" />;
    }
  };

  const getStatusText = (status: WeatherStatus) => {
     switch(status) {
        case WeatherStatus.SUNNY: return "状态良好";
        case WeatherStatus.CLOUDY: return "需要关注";
        case WeatherStatus.STORM: return "风险预警"; // Always triggered if lowestScore < 60
        default: return "等待检测";
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto pb-32 relative bg-warm-50">
      
      {/* 1. Daily Health Status Card */}
      <div className={`mx-4 mt-4 bg-white rounded-[2rem] p-6 shadow-sm border transition-colors duration-500 relative overflow-hidden
          ${report?.status === WeatherStatus.STORM ? 'border-status-danger/50' : 'border-warm-200'}
      `}>
         <div className="flex justify-between items-start z-10 relative">
             <div className="flex-1">
                 <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-1 bg-warm-100 text-warm-800 rounded-full text-xs font-bold">今日状态</span>
                    {isImproving && report?.status !== WeatherStatus.STORM && (
                        <span className="flex items-center gap-1 text-status-ok text-xs font-bold">
                            <TrendingUp size={12} /> 状态回升
                        </span>
                    )}
                 </div>
                 
                 <div className="flex items-baseline gap-3 mb-3">
                     <h1 className={`text-3xl font-bold ${report?.status === WeatherStatus.STORM ? 'text-status-danger' : 'text-warm-900'}`}>
                         {report ? getStatusText(report.status) : '未检测'}
                     </h1>
                     {todayScore !== null && (
                         <div className="flex items-baseline animate-in fade-in slide-in-from-bottom-2 duration-700">
                             <span className={`text-4xl font-bold font-mono ${report?.status === WeatherStatus.STORM ? 'text-status-danger' : 'text-face'}`}>
                                 {todayScore}
                             </span>
                             <span className="text-sm text-warm-500 font-bold ml-1">分</span>
                         </div>
                     )}
                 </div>

                 <p className="text-warm-500 text-sm leading-relaxed">
                     {loading ? "正在分析..." : (report?.text || "请点击下方模块，完成今天的健康打卡。")}
                 </p>
             </div>
             <div className="pl-4">
                 {report ? getStatusIcon(report.status) : <div className="p-4 bg-warm-50 rounded-full"><RefreshCw className="text-warm-200" /></div>}
             </div>
         </div>
         {/* Background Decoration */}
         <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl opacity-50
            ${report?.status === WeatherStatus.STORM ? 'bg-status-danger' : 'bg-warm-100'}
         `}></div>
      </div>

      {/* 2. Calibration Prompt */}
      {!hasBaseline && (
          <div 
            onClick={() => onNavigate('CALIBRATION')}
            className="mx-4 mt-4 bg-face-light border border-face/30 p-4 rounded-2xl flex items-center justify-between cursor-pointer"
          >
              <div className="flex items-center gap-4">
                  <div className="bg-white p-2 rounded-full text-face">
                    <Scale size={24} />
                  </div>
                  <div>
                      <h3 className="font-bold text-face-dark text-lg">首次使用请校准</h3>
                      <p className="text-sm text-face-dark/70">建立您的个人健康档案</p>
                  </div>
              </div>
              <ChevronRight className="text-face" />
          </div>
      )}

      {/* 3. Main Action Modules */}
      <div className="px-4 mt-6">
          <h2 className="text-lg font-bold text-warm-900 mb-4 ml-1">健康检测</h2>
          <div className="space-y-4">
            <ModuleCard 
                title="面部检测" 
                subtitle="对着镜子 笑一笑"
                icon={ScanFace}
                score={data.visual?.score}
                colorClass="bg-face text-white"
                iconBgClass="bg-white/20"
                onClick={() => onNavigate('MIRROR')}
            />
            <ModuleCard 
                title="声音检测" 
                subtitle="朗读文字 测语速"
                icon={Mic}
                score={data.audio?.score}
                colorClass="bg-voice text-white"
                iconBgClass="bg-white/20"
                onClick={() => onNavigate('VOICE')}
            />
            <ModuleCard 
                title="肢体检测" 
                subtitle="动动手指 举举手"
                icon={Hand}
                score={data.touch?.score}
                colorClass={data.touch?.score !== undefined && data.touch.score < 60 ? "bg-status-danger text-white" : "bg-touch text-white"} // Highlight critical module
                iconBgClass="bg-white/20"
                onClick={() => onNavigate('TOUCH')}
            />
          </div>
      </div>

      {/* 4. 7-Day Streak Calendar (Replaces Chart) */}
      <div className="m-4 mt-8 bg-white p-6 rounded-[2rem] border border-warm-200 shadow-sm relative overflow-hidden">
          {/* Header & Gamification */}
          <div className="flex justify-between items-center mb-6">
             <div className="flex items-center gap-3">
                 <div className={`p-2 rounded-full ${streakCount >= 3 ? 'bg-amber-100 text-amber-600' : 'bg-warm-100 text-warm-400'}`}>
                    {streakCount >= 7 ? <Trophy size={24} fill="currentColor" /> : (streakCount >= 3 ? <Medal size={24} fill="currentColor" /> : <CalendarDays size={24} />)}
                 </div>
                 <div>
                     <h3 className="text-lg font-bold text-warm-900">连续打卡</h3>
                     <p className="text-sm text-warm-500 font-bold">
                        {streakCount > 0 ? `已坚持 ${streakCount} 天，真棒！` : '今天还没打卡哦'}
                     </p>
                 </div>
             </div>
             {contact && (
                 <button onClick={() => handleShare('WEEKLY')} className="text-sm text-voice font-bold flex items-center gap-1 px-3 py-1 bg-voice-light rounded-full">
                     <Send size={14} /> 分享
                 </button>
             )}
          </div>

          {/* Calendar Dots */}
          <div className="flex justify-between items-end relative z-10">
              {weekData.map((day, index) => (
                  <div key={index} className="flex flex-col items-center gap-2 flex-1">
                      {/* Day Label (e.g. 昨天) */}
                      <span className={`text-[10px] font-bold ${day.isToday ? 'text-face-dark' : 'text-warm-400'}`}>
                          {day.dayLabel}
                      </span>
                      
                      {/* The Dot */}
                      <div className={`
                          w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500
                          ${day.isCompleted 
                              ? 'bg-face border-face text-white shadow-md scale-100' 
                              : (day.isToday ? 'bg-white border-face text-face border-dashed animate-pulse' : 'bg-warm-50 border-warm-200 text-transparent')
                          }
                      `}>
                          {day.isCompleted && <Check size={16} strokeWidth={4} />}
                      </div>
                  </div>
              ))}
          </div>

          {/* Connection Line behind dots */}
          <div className="absolute bottom-[38px] left-8 right-8 h-0.5 bg-warm-100 z-0"></div>
      </div>

      {/* 5. Emergency SOS (Condition: Storm) */}
      {report?.status === WeatherStatus.STORM && (
        <div className="fixed bottom-24 left-4 right-4 z-50 animate-bounce">
             <div className="bg-white border-2 border-status-danger p-5 rounded-3xl shadow-xl flex flex-col gap-4">
                <div className="flex items-center gap-4">
                    <ShieldAlert className="text-status-danger" size={40} />
                    <div>
                        <h3 className="text-xl font-bold text-status-danger">风险提示</h3>
                        <p className="text-sm text-warm-500">检测到异常，请通知家人。</p>
                    </div>
                </div>
                
                <div className="flex gap-3">
                    <a href="tel:120" className="flex-1 bg-status-danger text-white text-lg font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-md">
                        <Phone size={24} fill="currentColor" />
                        呼叫 120
                    </a>
                    <button onClick={() => handleShare('EMERGENCY')} className="flex-1 bg-warm-100 text-warm-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                        <Share2 size={24} />
                        通知{contact?.name}
                    </button>
                </div>
             </div>
        </div>
      )}

    </div>
  );
};

// Helper Component for the Big Colored Cards
const ModuleCard = ({ title, subtitle, icon: Icon, score, colorClass, iconBgClass, onClick }: any) => (
    <div onClick={onClick} className={`${colorClass} p-5 rounded-[1.5rem] flex items-center justify-between shadow-lg active:scale-95 transition-transform cursor-pointer relative overflow-hidden h-28`}>
        <div className="z-10 flex flex-col justify-center h-full">
            <h3 className="text-2xl font-bold tracking-wide mb-1">{title}</h3>
            <p className="opacity-90 text-sm">{score ? `得分: ${score}` : subtitle}</p>
        </div>
        <div className={`z-10 w-16 h-16 rounded-full ${iconBgClass} flex items-center justify-center`}>
            {score ? (
                <span className="text-2xl font-bold">{score}</span>
            ) : (
                <Icon size={32} strokeWidth={2} />
            )}
        </div>
        {/* Decorative Circle */}
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
    </div>
);

export default Dashboard;