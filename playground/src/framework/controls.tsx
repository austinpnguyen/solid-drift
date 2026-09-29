import { type JSX } from "solid-js";

/* Small reusable controls bound to each primitive's real options. */

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
}

export function Slider(props: SliderProps) {
  return (
    <label class="ctl">
      <span class="ctl-label">
        {props.label}
        <b>{props.value}</b>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
      />
    </label>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

export function Toggle(props: ToggleProps) {
  return (
    <label class="ctl ctl-row">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span class="ctl-label">{props.label}</span>
    </label>
  );
}

interface SelectProps {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}

export function Select(props: SelectProps) {
  return (
    <label class="ctl">
      <span class="ctl-label">{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        {props.options.map((o) => (
          <option value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

interface ButtonProps {
  onClick: () => void;
  children: JSX.Element;
  kind?: "primary" | "ghost";
}

export function Button(props: ButtonProps) {
  return (
    <button
      type="button"
      class={`btn ${props.kind === "ghost" ? "btn-ghost" : "btn-primary"}`}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

interface TextInputProps {
  label: string;
  value: string;
  placeholder?: string;
  onInput: (v: string) => void;
}

export function TextInput(props: TextInputProps) {
  return (
    <label class="ctl">
      <span class="ctl-label">{props.label}</span>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </label>
  );
}
