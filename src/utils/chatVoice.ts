// Голосовые сообщения из мобильного приложения.
//
// Приложение записывает голосовое (AAC в .m4a, моно, 32 кбит/с) и кладёт его
// прямо в текст сообщения — так же, как админка кладёт фото:
//   «[VOICE]:<длина в секундах>:data:audio/mp4;base64,....»
// Отдельного хранилища не нужно, а минута голоса — около 240 КБ, это
// помещается в документ Firestore.

export const isVoice = (message: string): boolean => message.startsWith('[VOICE]:');

export function parseVoice(message: string): { seconds: number; src: string } {
  const rest = message.substring(8);
  const colon = rest.indexOf(':');
  return {
    seconds: parseInt(rest.substring(0, colon), 10) || 0,
    src: rest.substring(colon + 1),
  };
}

export const formatVoiceLength = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
