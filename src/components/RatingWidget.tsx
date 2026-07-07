import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import { motion } from 'motion/react';

interface Order {
  id: string;
  [key: string]: any;
}

interface RatingWidgetProps {
  order: Order;
  onRate: (orderId: string, rating: 1 | 2 | 3 | 4 | 5, comment: string) => void;
  onDismiss: (orderId: string) => void;
}

export const RatingWidget: React.FC<RatingWidgetProps> = ({ order, onRate, onDismiss }) => {
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedRating, setSelectedRating] = useState<1 | 2 | 3 | 4 | 5 | 0>(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (selectedRating === 0) return;
    onRate(order.id, selectedRating as 1 | 2 | 3 | 4 | 5, comment);
    setSubmitted(true);
    setTimeout(() => onDismiss(order.id), 1200);
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel rounded-2xl p-5 flex items-center justify-center gap-2 text-emerald-500 font-bold text-sm"
      >
        ✓ Спасибо за оценку!
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass-panel rounded-2xl p-5 relative"
    >
      <button
        onClick={() => onDismiss(order.id)}
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>

      <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">
        Как вам заказ {order.id}?
      </p>
      <p className="text-xs text-slate-450 dark:text-slate-400 mb-3">
        Оцените качество печати
      </p>

      <div className="flex items-center gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setSelectedRating(star as 1 | 2 | 3 | 4 | 5)}
            className="cursor-pointer transition-transform hover:scale-110"
          >
            <Star
              className={`w-7 h-7 ${
                star <= (hoverRating || selectedRating)
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-slate-300 dark:text-slate-600'
              }`}
            />
          </button>
        ))}
      </div>

      {selectedRating > 0 && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий (необязательно)"
            rows={2}
            className="w-full text-xs bg-white/60 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 mb-3 outline-none focus:border-indigo-400 resize-none placeholder-slate-400"
          />
          <button
            onClick={handleSubmit}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            Отправить оценку
          </button>
        </motion.div>
      )}
    </motion.div>
  );
};
