import React from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import * as Dialog from "https://esm.sh/@radix-ui/react-dialog@1.1.15?deps=react@18.3.1,react-dom@18.3.1";
import * as HoverCardPrimitive from "https://esm.sh/@radix-ui/react-hover-card@1.1.15?deps=react@18.3.1,react-dom@18.3.1";
import * as ScrollArea from "https://esm.sh/@radix-ui/react-scroll-area@1.2.10?deps=react@18.3.1,react-dom@18.3.1";
import * as SelectPrimitive from "https://esm.sh/@radix-ui/react-select@2.2.6?deps=react@18.3.1,react-dom@18.3.1";
import { cva } from "https://esm.sh/class-variance-authority@0.7.1";
import { clsx } from "https://esm.sh/clsx@2.1.1";
import { twMerge } from "https://esm.sh/tailwind-merge@2.5.2";

const h = React.createElement;
const PortalContainerContext = React.createContext(null);

function cn(...inputs) {
  return twMerge(clsx(...inputs));
}

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "bg-slate-900 text-white hover:bg-slate-800",
        secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
        outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

function Button({ className = "", variant = "default", children, ...props }) {
  return h("button", { className: cn(buttonVariants({ variant }), className), ...props }, children);
}

function ChevronDownIcon() {
  return h("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }, [
    h("path", { key: "p", d: "M4 6L8 10L12 6" })
  ]);
}

function CheckIcon() {
  return h("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }, [
    h("path", { key: "p", d: "M3.5 8L6.5 11L12.5 5" })
  ]);
}

function flattenSelectNodes(children) {
  const items = [];
  React.Children.forEach(children, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (Array.isArray(child)) {
      items.push(...flattenSelectNodes(child));
      return;
    }
    items.push(child);
  });
  return items;
}

function textFromNode(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((item) => textFromNode(item)).join("");
  if (React.isValidElement(node)) return textFromNode(node.props?.children);
  return "";
}

function parseSelectChildren(children) {
  const groups = [];
  let placeholder = "";
  const pushOption = (option, groupLabel = null) => {
    if (!React.isValidElement(option) || option.type !== "option") return;
    const value = option.props?.value ?? "";
    const label = textFromNode(option.props?.children) || String(value);
    if ((option.props?.disabled || value === "") && !placeholder) {
      placeholder = label;
    }
    if (option.props?.disabled || value === "") return;
    let group = groups.find((item) => item.label === groupLabel);
    if (!group) {
      group = { label: groupLabel, options: [] };
      groups.push(group);
    }
    group.options.push({ value: String(value), label });
  };
  for (const child of flattenSelectNodes(children)) {
    if (!React.isValidElement(child)) continue;
    if (child.type === "optgroup") {
      const label = child.props?.label ? String(child.props.label) : null;
      for (const option of flattenSelectNodes(child.props?.children)) pushOption(option, label);
      continue;
    }
    if (child.type === "option") pushOption(child, null);
  }
  return { groups, placeholder: placeholder || "Select an option" };
}

function Field({ label, children }) {
  return h("div", { className: "block space-y-2 text-sm" }, [
    h("span", { key: "l", className: "font-medium" }, label),
    children
  ]);
}

function Input({ className = "", ...props }) {
  return h("input", {
    className: cn("w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-100", className),
    ...props
  });
}

function Textarea({ className = "", ...props }) {
  return h("textarea", {
    className: cn("min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-100", className),
    ...props
  });
}

function Select({ className = "", value = "", onChange, disabled = false, children, ...props }) {
  const parsed = parseSelectChildren(children);
  const portalContainer = React.useContext(PortalContainerContext);
  return h(SelectPrimitive.Root, {
    value: value || undefined,
    disabled,
    onValueChange: (nextValue) => onChange?.({ target: { value: nextValue } })
  }, [
    h(SelectPrimitive.Trigger, {
      key: "trigger",
      className: cn(
        "flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-100 data-[placeholder]:text-slate-500",
        className
      ),
      ...props
    }, [
      h(SelectPrimitive.Value, { key: "value", placeholder: parsed.placeholder }),
      h(SelectPrimitive.Icon, { key: "icon", className: "text-slate-500" }, h(ChevronDownIcon))
    ]),
    h(SelectPrimitive.Portal, { key: "portal", container: portalContainer || undefined },
      h(SelectPrimitive.Content, {
        position: "popper",
        sideOffset: 8,
        onCloseAutoFocus: (event) => event.preventDefault(),
        className: "z-[70] max-h-96 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      }, [
        h(SelectPrimitive.Viewport, { key: "viewport", className: "p-1" }, parsed.groups.map((group, groupIndex) => group.label
          ? h(SelectPrimitive.Group, { key: `group-${groupIndex}` }, [
              h(SelectPrimitive.Label, { key: "label", className: "px-8 py-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500" }, group.label),
              ...group.options.map((option) => h(SelectPrimitive.Item, {
                key: option.value,
                value: option.value,
                className: "relative flex w-full cursor-default select-none items-center rounded-xl py-2.5 pl-8 pr-3 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900"
              }, [
                h("span", { key: "indicator", className: "absolute left-2 inline-flex h-4 w-4 items-center justify-center" },
                  h(SelectPrimitive.ItemIndicator, null, h(CheckIcon))
                ),
                h(SelectPrimitive.ItemText, { key: "text" }, option.label)
              ]))
            ])
          : group.options.map((option) => h(SelectPrimitive.Item, {
              key: option.value,
              value: option.value,
              className: "relative flex w-full cursor-default select-none items-center rounded-xl py-2.5 pl-8 pr-3 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900"
            }, [
              h("span", { key: "indicator", className: "absolute left-2 inline-flex h-4 w-4 items-center justify-center" },
                h(SelectPrimitive.ItemIndicator, null, h(CheckIcon))
              ),
              h(SelectPrimitive.ItemText, { key: "text" }, option.label)
            ]))
        ))
      ])
    )
  ]);
}

function Modal({ open, title, description, children, onClose, size = "xl" }) {
  const [portalContainer, setPortalContainer] = React.useState(null);
  const widthClass = size === "lg" ? "max-w-4xl" : size === "full" ? "max-w-7xl" : "max-w-6xl";
  return h(Dialog.Root, {
    open,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) onClose?.();
    }
  }, h(Dialog.Portal, null, [
    h(Dialog.Overlay, {
      key: "overlay",
      className: "fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm"
    }),
    h(Dialog.Content, {
      key: "content",
      ref: setPortalContainer,
      className: cn(
        "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[32px] border border-slate-200 bg-white shadow-2xl outline-none",
        widthClass
      )
    }, h(PortalContainerContext.Provider, { value: portalContainer }, [
      h("div", { key: "header", className: "flex items-start justify-between gap-6 border-b border-slate-200 px-6 py-5" }, [
        h("div", { key: "copy" }, [
          h(Dialog.Title, { key: "title", className: "text-2xl font-semibold tracking-tight text-slate-950" }, title),
          description ? h(Dialog.Description, { key: "description", className: "mt-2 max-w-3xl text-sm leading-6 text-slate-500" }, description) : null
        ]),
        h(Button, { key: "close", type: "button", variant: "outline", onClick: onClose }, "Close")
      ]),
      h(ScrollArea.Root, { key: "scroll", className: "max-h-[calc(100vh-7rem)] overflow-hidden" }, [
        h(ScrollArea.Viewport, { key: "viewport", className: "px-6 py-6" }, children),
        h(ScrollArea.Scrollbar, { key: "scrollbar", orientation: "vertical", className: "flex w-2.5 touch-none select-none p-0.5" },
          h(ScrollArea.Thumb, { className: "relative flex-1 rounded-full bg-slate-300" })
        )
      ])
    ]))
  ]));
}

function HoverCard({ trigger, children, side = "top", align = "start", openDelay = 120, closeDelay = 120 }) {
  return h(HoverCardPrimitive.Root, { openDelay, closeDelay }, [
    h(HoverCardPrimitive.Trigger, { key: "trigger", asChild: true }, trigger),
    h(HoverCardPrimitive.Portal, { key: "portal" },
      h(HoverCardPrimitive.Content, {
        side,
        align,
        sideOffset: 8,
        className: "z-[70] w-72 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-2xl outline-none"
      }, children)
    )
  ]);
}

window.React = React;
window.ReactDOM = { createRoot };
window.TethermarkUI = {
  Button,
  Field,
  Input,
  Modal,
  HoverCard,
  Select,
  Textarea,
  cn
};
