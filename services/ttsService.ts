
export const speak = (text: string, priority: boolean = false) => {
  if (!('speechSynthesis' in window)) return;

  // If priority is true, cancel current speech immediately
  if (priority) {
    window.speechSynthesis.cancel();
  }

  // Create utterance
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.90; // Slower rate for elderly users
  utterance.pitch = 1.0; // Natural pitch
  utterance.volume = 1.0;

  window.speechSynthesis.speak(utterance);
};

export const stopSpeech = () => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
};
