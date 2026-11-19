import React from "react";

export function PageHeader({ title, subtitle, action }) {
  return <div className="page-header"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

export function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button onClick={onClose}>×</button></div>{children}</div>
  </div>;
}

export function Status({ value }) {
  const cls = String(value).toLowerCase().replaceAll("_","-");
  return <span className={`status ${cls}`}>{String(value).replaceAll("_"," ")}</span>;
}

export function Loader() { return <div className="loader"><span/></div>; }
export function Empty({ text="No records found" }) { return <div className="empty">{text}</div>; }
