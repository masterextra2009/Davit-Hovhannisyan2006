import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

// Штрих-код номера заказа на карточке в очереди. Тот же Code 128 (набор B),
// что показывает клиенту приложение (sever18-app/Barcode.tsx): сканер в
// мастерской читает только линейные коды, QR он не берёт (Давид, 06.10.2026).
export function OrderBarcode({ value, height = 44 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128B',
        displayValue: false,
        height,
        width: 2,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch {
      // Номер с символами вне Code 128 — просто оставляем подпись текстом ниже.
    }
  }, [value, height]);

  return (
    <div className="bg-white rounded-lg px-3 pt-2.5 pb-1.5 flex flex-col items-center" title={`Штрих-код заказа ${value}`}>
      <svg ref={ref} className="w-full max-w-[260px] h-auto" style={{ height }} preserveAspectRatio="none" aria-label={`Штрих-код заказа ${value}`} />
      <span className="mt-1 font-mono text-[11px] font-bold tracking-widest text-black">{value}</span>
    </div>
  );
}
