import React, { useEffect, useState } from "react";
import api from "../services/api";
import { PageHeader, Loader } from "../components/UI";
import { Clock3, CircleDollarSign, ScanLine, TrendingUp, Building2, TriangleAlert } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const colors = ["#5b5bd6","#24a179","#f59e0b","#ef4444","#8b5cf6"];
export default function Dashboard() {
  const [data,setData]=useState(null); const [error,setError]=useState("");
  useEffect(()=>{api.get("/dashboard/").then(r=>setData(r.data)).catch(e=>setError(e.response?.data?.detail||"Unable to load dashboard"));},[]);
  if(error) return <div className="alert error">{error}</div>;
  if(!data) return <Loader />;
  const cards=[
    ["Pending approvals",data.pending_approvals,Clock3,"violet"],
    ["Verified extraction accuracy",data.verified_extraction_field_count?`${data.verified_extraction_accuracy}%`:"N/A",ScanLine,"green"],
    ["Processing time",`${data.processing_turnaround_hours}h`,TrendingUp,"orange"],
    ["Payment records",data.payment_status.reduce((n,x)=>n+x.count,0),CircleDollarSign,"blue"],
    ["Open exceptions",data.exceptions_count,TriangleAlert,"orange"],
  ];
  const statusData=data.invoice_status.map(x=>({name:String(x.status).replaceAll("_"," "),value:x.count}));
  return <>
    <PageHeader title="Dashboard" subtitle="Accounts payable overview" />
    <div className="metric-grid">{cards.map(([label,value,Icon,color])=><div className="metric" key={label}><div className={`metric-icon ${color}`}><Icon/></div><div><p>{label}</p><h2>{value}</h2>{label==="Verified extraction accuracy"&&<small>{data.verified_extraction_field_count} human-verified fields</small>}</div></div>)}</div>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-head"><h3>Invoice aging</h3><span>Outstanding amount</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.aging}><XAxis dataKey="bucket"/><YAxis/><Tooltip/><Bar dataKey="amount" fill="#5b5bd6" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></section>
      <section className="panel"><div className="panel-head"><h3>Invoice status</h3></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={3}>{statusData.map((_,i)=><Cell key={i} fill={colors[i%colors.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></div></section>
      <section className="panel"><div className="panel-head"><h3>Payment tracking</h3><span>Amount by payment state</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.payment_status}><XAxis dataKey="status"/><YAxis/><Tooltip/><Bar dataKey="amount" fill="#24a179" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></section>
      <section className="panel wide"><div className="panel-head"><h3>Vendor spend</h3><span>Top vendors</span></div><div className="vendor-list">{data.vendor_analytics.map((v,i)=><div key={v.vendor__name||i}><Building2/><span>{v.vendor__name||"Unknown"}</span><b>₹ {Number(v.total).toLocaleString()}</b></div>)}</div></section>
    </div>
  </>;
}
