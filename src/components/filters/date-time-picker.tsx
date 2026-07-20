import { enUS, zhCN } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";

const pad2 = (value: number) => String(value).padStart(2, "0");

function formatButton(value: number | null, placeholder: string): string {
  if (value === null) return placeholder;
  const date = new Date(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/**
 * 日期 + 时:分:秒 选择器。
 * inclusiveSecond=true 时（结束时间），选中秒按闭区间处理（+999ms）。
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder,
  inclusiveSecond = false,
  ariaLabel,
}: Readonly<{
  value: number | null;
  onChange: (ms: number | null) => void;
  placeholder: string;
  inclusiveSecond?: boolean;
  ariaLabel: string;
}>) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = value === null ? null : new Date(value);
  const [hour, setHour] = useState("00");
  const [minute, setMinute] = useState("00");
  const [second, setSecond] = useState("00");

  useEffect(() => {
    if (!current) return;
    setHour(pad2(current.getHours()));
    setMinute(pad2(current.getMinutes()));
    setSecond(pad2(current.getSeconds()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open]);

  const emit = (date: Date | null, h: string, m: string, s: string) => {
    if (!date) {
      onChange(null);
      return;
    }
    const next = new Date(date);
    next.setHours(
      Math.min(23, Math.max(0, Number.parseInt(h) || 0)),
      Math.min(59, Math.max(0, Number.parseInt(m) || 0)),
      Math.min(59, Math.max(0, Number.parseInt(s) || 0)),
      0,
    );
    onChange(next.getTime() + (inclusiveSecond ? 999 : 0));
  };

  const timeInput = (val: string, setter: (v: string) => void, label: string) => (
    <Input
      aria-label={label}
      className="tnum h-7 w-12 px-1 text-center text-xs"
      inputMode="numeric"
      maxLength={2}
      value={val}
      onChange={(event) => {
        const next = event.target.value.replace(/\D/g, "").slice(0, 2);
        setter(next);
        emit(
          current,
          label === t("datePicker.hour") ? next : hour,
          label === t("datePicker.minute") ? next : minute,
          label === t("datePicker.second") ? next : second,
        );
      }}
    />
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className="tnum h-7 justify-start gap-1.5 px-2 text-xs font-normal"
          variant="outline"
        >
          <CalendarDays size={13} className="text-muted-foreground" />
          {formatButton(value, placeholder)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <DayPicker
          locale={i18n.resolvedLanguage === "en-US" ? enUS : zhCN}
          mode="single"
          selected={current ?? undefined}
          onSelect={(date) => emit(date ?? null, hour, minute, second)}
        />
        <div className="mt-2 flex items-center justify-center gap-1 border-t border-border pt-2">
          {timeInput(hour, setHour, t("datePicker.hour"))}
          <span className="text-muted-foreground">:</span>
          {timeInput(minute, setMinute, t("datePicker.minute"))}
          <span className="text-muted-foreground">:</span>
          {timeInput(second, setSecond, t("datePicker.second"))}
          <Button className="ml-2" size="sm" variant="ghost" onClick={() => onChange(null)}>
            {t("common.clear")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
