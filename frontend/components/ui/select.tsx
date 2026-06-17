"use client";

import * as React from "react";
import { ListboxSelect } from "@/components/ui/listbox-select";

type SelectProps = Omit<
  React.ComponentProps<"select">,
  "children" | "onChange"
> & {
  children: React.ReactNode;
  onChange?: (event: { target: { value: string } }) => void;
};

export function Select({
  children,
  className,
  disabled,
  id,
  onChange,
  title,
  value,
  ...props
}: SelectProps) {
  const options = React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement<React.ComponentProps<"option">>(child)) {
      return [];
    }

    if (child.type !== "option") {
      return [];
    }

    const optionValue =
      typeof child.props.value === "string"
        ? child.props.value
        : String(child.props.value ?? "");
    const label = React.Children.toArray(child.props.children).join("");

    return [
      {
        value: optionValue,
        label,
      },
    ];
  });

  return (
    <ListboxSelect
      id={id}
      value={typeof value === "string" ? value : String(value ?? "")}
      disabled={disabled}
      title={title}
      ariaLabel={
        typeof props["aria-label"] === "string" ? props["aria-label"] : undefined
      }
      ariaInvalid={Boolean(props["aria-invalid"])}
      triggerClassName={className}
      options={options}
      onChange={(nextValue) => onChange?.({ target: { value: nextValue } })}
      emptyLabel={options[0]?.label}
    />
  );
}
