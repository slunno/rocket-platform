import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string };

export function Input({ label, id, className = '', ...props }: InputProps) {
  const inputId = id ?? props.name ?? label.toLocaleLowerCase('pt-BR').replace(/\s+/g, '-');
  return (
    <label className="field" htmlFor={inputId}>
      <span>{label}</span>
      <input id={inputId} className={`input ${className}`.trim()} {...props} />
    </label>
  );
}
