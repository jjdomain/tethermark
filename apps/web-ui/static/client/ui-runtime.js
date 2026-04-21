import React from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import * as Dialog from "https://esm.sh/@radix-ui/react-dialog@1.1.15?deps=react@18.3.1,react-dom@18.3.1";
import * as ScrollArea from "https://esm.sh/@radix-ui/react-scroll-area@1.2.10?deps=react@18.3.1,react-dom@18.3.1";
import { cva } from "https://esm.sh/class-variance-authority@0.7.1";
import { clsx } from "https://esm.sh/clsx@2.1.1";
import { twMerge } from "https://esm.sh/tailwind-merge@2.5.2";

const h = React.createElement;

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

function Modal({ open, title, description, children, onClose, size = "xl" }) {
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
      className: cn(
        "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[32px] border border-slate-200 bg-white shadow-2xl outline-none",
        widthClass
      )
    }, [
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
    ])
  ]));
}

window.React = React;
window.ReactDOM = { createRoot };
window.TethermarkUI = {
  Button,
  Modal,
  cn
};
