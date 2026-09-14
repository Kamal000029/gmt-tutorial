/**
 * GMT Tutorial Backend v2.0
 * Genius Mathematics Tutorial — Naresh Kumar Yadav
 */
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const cors    = require('cors');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 3000;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
// ── Admin Credentials ──────────────────────────────────────────────────────
const ADMIN = { username: 'gmt_admin', password: 'GMT@2026#Naresh' };

// ── File categories & folders ──────────────────────────────────────────────
const CATEGORIES = {
  pdf:      { exts: ['.pdf'],                                          folder: 'pdfs',            label: 'PDF Document' },
  note:     { exts: ['.pdf','.doc','.docx','.txt','.rtf'],            folder: 'notes',           label: 'Study Notes' },
  image:    { exts: ['.jpg','.jpeg','.png','.gif','.webp','.svg'],    folder: 'images',          label: 'Image' },
  syllabus: { exts: ['.pdf','.doc','.docx'],                          folder: 'syllabus',        label: 'Syllabus' },
  question: { exts: ['.pdf','.doc','.docx','.jpg','.jpeg','.png'],   folder: 'question-papers', label: 'Question Paper' },
  solution: { exts: ['.pdf','.doc','.docx','.jpg','.jpeg','.png'],   folder: 'solutions',       label: 'Solution' },
  book:     { exts: ['.pdf','.epub'],                                  folder: 'books',           label: 'Book / eBook' },
  video:    { exts: ['.mp4','.webm','.ogg','.mov'],                   folder: 'videos',          label: 'Video Lecture' },
  ppt:      { exts: ['.ppt','.pptx'],                                  folder: 'pdfs',            label: 'Presentation' },
};

const ALL_EXTS = [...new Set(Object.values(CATEGORIES).flatMap(c => c.exts))];
const MAX_SIZE  = 100 * 1024 * 1024; // 100 MB

// ── Directories ────────────────────────────────────────────────────────────
const ROOT = __dirname;
['data','uploads/pdfs','uploads/notes','uploads/images','uploads/videos',
 'uploads/syllabus','uploads/question-papers','uploads/solutions','uploads/books']
  .forEach(d => { const p = path.join(ROOT,d); if (!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); });

// ── DB helpers ─────────────────────────────────────────────────────────────
const DB = {
  resources:    path.join(ROOT,'data','resources.json'),
  admissions:   path.join(ROOT,'data','admissions.json'),
  notices:      path.join(ROOT,'data','notices.json'),
  gallery:      path.join(ROOT,'data','gallery.json'),
  testimonials: path.join(ROOT,'data','testimonials.json'),
  settings:     path.join(ROOT,'data','settings.json'),
};

function read(f)    { if (!fs.existsSync(f)) return []; try { const c=fs.readFileSync(f,'utf8').trim(); return c?JSON.parse(c):[]; } catch{return[];} }
function write(f,d) { fs.writeFileSync(f,JSON.stringify(d,null,2),'utf8'); }

function readSettings() {
  if (!fs.existsSync(DB.settings)) { const s={siteName:'GMT Tutorial',ownerName:'Naresh Kumar Yadav',phone:'',email:'',address:'',aboutText:''}; write(DB.settings,s); return s; }
  try { return JSON.parse(fs.readFileSync(DB.settings,'utf8')); } catch { return {}; }
}

function fmtBytes(b) {
  if (!b) return '0 B'; const k=1024,s=['B','KB','MB','GB'],i=Math.floor(Math.log(b)/Math.log(k));
  return parseFloat((b/Math.pow(k,i)).toFixed(1))+' '+s[i];
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({origin:true,credentials:true}));
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true,limit:'10mb'}));
app.use(session({ secret:'gmt-2026-secret', resave:false, saveUninitialized:false, cookie:{secure:false,httpOnly:true,maxAge:86400000} }));
app.use(express.static(path.join(ROOT,'public')));
app.use('/uploads', express.static(path.join(ROOT,'uploads')));

// ── Multer ─────────────────────────────────────────────────────────────────
// // Cloudinary Storage Setup
// // Cloudinary Storage Setup
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const cat = CATEGORIES[req.body.type] || CATEGORIES.pdf;
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    const finalFilename = `${base}_${Date.now()}`;

    return {
      folder: `gmt_uploads/${cat.folder || 'general'}`,
      public_id: finalFilename,
      resource_type: 'auto',
    };
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALL_EXTS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type "${ext}" not allowed.`));
  }
};

const upload = multer({ 
  storage: storage, 
  fileFilter: fileFilter,
  limits: { fileSize: MAX_SIZE } 
});

// ── Auth middleware ────────────────────────────────────────────────────────
const auth=(req,res,next)=>{ if(req.session?.isAdmin) return next(); res.status(401).json({error:'Unauthorized'}); };

// ── Helper: build resource object ─────────────────────────────────────────
function buildResource(req,file) {
  const {title,description,classLevel,subject,type,tags,year,chapter,language,isPinned}=req.body;
  const safeType=CATEGORIES[type]?type:'pdf';
  const cat=CATEGORIES[safeType];
  const ext=path.extname(file.originalname).toLowerCase();
  return {
    id:          uuidv4(),
    title:       (title||file.originalname).trim(),
    description: (description||'').trim(),
    class:       classLevel||'all',
    subject:     (subject||'General').trim(),
    type:        safeType,
    typeLabel:   cat.label,
    filename:    file.filename,
    originalName:file.originalname,
    url:         `/uploads/${cat.folder}/${file.filename}`,
    size:        file.size,
    sizeLabel:   fmtBytes(file.size),
    ext,
    tags:        tags?tags.split(',').map(t=>t.trim()).filter(Boolean):[],
    year:        year||'',
    chapter:     chapter||'',
    language:    language||'Hindi/English',
    isPinned:    isPinned==='true'||isPinned===true,
    visible:     true,
    uploadedAt:  new Date().toISOString(),
    uploadedBy:  req.session.username||'admin',
    downloads:   0,
    views:       0,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════
app.post('/api/admin/login',(req,res)=>{
  const {username,password}=req.body;
  if (username===ADMIN.username && password===ADMIN.password) {
    req.session.isAdmin=true; req.session.username=username; req.session.loginTime=new Date().toISOString();
    return res.json({success:true,username});
  }
  res.status(401).json({success:false,error:'Invalid username or password'});
});
app.post('/api/admin/logout',(req,res)=>{ req.session.destroy(); res.json({success:true}); });
app.get('/api/admin/check',(req,res)=>res.json({isAdmin:!!req.session?.isAdmin,username:req.session?.username||null}));

// ═══════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════════

app.get('/api/settings',(req,res)=>res.json(readSettings()));

app.get('/api/resources',(req,res)=>{
  let r=read(DB.resources).filter(r=>r.visible!==false);
  const {class:cls,subject,type,year,search,pinned}=req.query;
  if (cls)     r=r.filter(x=>x.class===cls||x.class==='all');
  if (subject) r=r.filter(x=>x.subject?.toLowerCase().includes(subject.toLowerCase()));
  if (type)    r=r.filter(x=>x.type===type);
  if (year)    r=r.filter(x=>x.year===year);
  if (pinned==='true') r=r.filter(x=>x.isPinned);
  if (search)  { const q=search.toLowerCase(); r=r.filter(x=>x.title.toLowerCase().includes(q)||x.description?.toLowerCase().includes(q)||x.subject?.toLowerCase().includes(q)||x.tags?.some(t=>t.toLowerCase().includes(q))); }
  r.sort((a,b)=>(b.isPinned?1:0)-(a.isPinned?1:0)||new Date(b.uploadedAt)-new Date(a.uploadedAt));
  res.json(r);
});

app.get('/api/resources/:id',(req,res)=>{
  const r=read(DB.resources); const i=r.findIndex(x=>x.id===req.params.id&&x.visible!==false);
  if (i===-1) return res.status(404).json({error:'Not found'});
  r[i].views=(r[i].views||0)+1; write(DB.resources,r); res.json(r[i]);
});

app.get('/api/download/:id',(req,res)=>{
  const r=read(DB.resources); const i=r.findIndex(x=>x.id===req.params.id);
  if (i===-1) return res.status(404).json({error:'Not found'});
  r[i].downloads=(r[i].downloads||0)+1; write(DB.resources,r); res.redirect(r[i].url);
});

app.get('/api/notices',(req,res)=>res.json(read(DB.notices).filter(n=>n.active!==false).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
app.get('/api/gallery',(req,res)=>res.json(read(DB.gallery).filter(g=>g.visible!==false).sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt))));
app.get('/api/testimonials',(req,res)=>res.json(read(DB.testimonials).filter(t=>t.visible!==false)));

app.post('/api/admissions',(req,res)=>{
  const {name,cls,mobile,village,school,parentName,parentMobile,message}=req.body;
  if (!name||!cls||!mobile) return res.status(400).json({error:'Name, Class and Mobile are required.'});
  if (!/^\d{10}$/.test(mobile)) return res.status(400).json({error:'Mobile must be 10 digits.'});
  const a=read(DB.admissions);
  const entry={id:uuidv4(),name:name.trim(),class:cls,mobile:mobile.trim(),village:(village||'').trim(),school:(school||'').trim(),parentName:(parentName||'').trim(),parentMobile:(parentMobile||'').trim(),message:(message||'').trim(),submittedAt:new Date().toISOString(),status:'new',notes:''};
  a.unshift(entry); write(DB.admissions,a);
  res.json({success:true,message:'Admission form submitted! We will contact you soon.',id:entry.id});
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — RESOURCES
// ═══════════════════════════════════════════════════════════════════

app.post('/api/admin/resources/upload', auth,(req,res)=>{
  upload.single('file')(req,res,err=>{
    if (err) { if (err.code==='LIMIT_FILE_SIZE') return res.status(400).json({error:`File too large. Max ${fmtBytes(MAX_SIZE)}.`}); return res.status(400).json({error:err.message}); }
    if (!req.file) return res.status(400).json({error:'No file uploaded.'});
    if (!req.body.title) return res.status(400).json({error:'Title is required.'});
    const resource=buildResource(req,req.file);
    const r=read(DB.resources); r.unshift(resource); write(DB.resources,r);
    res.json({success:true,resource});
  });
});

app.post('/api/admin/resources/upload-bulk', auth,(req,res)=>{
  upload.array('files',20)(req,res,err=>{
    if (err) { if (err.code==='LIMIT_FILE_SIZE') return res.status(400).json({error:`A file is too large. Max ${fmtBytes(MAX_SIZE)}.`}); return res.status(400).json({error:err.message}); }
    if (!req.files?.length) return res.status(400).json({error:'No files uploaded.'});
    const r=read(DB.resources);
    const uploaded=req.files.map(file=>{
      const obj=buildResource(req,file);
      if (!req.body.title) obj.title=path.basename(file.originalname,path.extname(file.originalname)).replace(/[_-]+/g,' ');
      r.unshift(obj); return obj;
    });
    write(DB.resources,r); res.json({success:true,count:uploaded.length,resources:uploaded});
  });
});

app.get('/api/admin/resources', auth,(req,res)=>{
  let r=read(DB.resources);
  const {search,type,class:cls,subject}=req.query;
  if (type)    r=r.filter(x=>x.type===type);
  if (cls)     r=r.filter(x=>x.class===cls);
  if (subject) r=r.filter(x=>x.subject?.toLowerCase().includes(subject.toLowerCase()));
  if (search)  { const q=search.toLowerCase(); r=r.filter(x=>x.title.toLowerCase().includes(q)||x.originalName?.toLowerCase().includes(q)); }
  res.json(r.sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt)));
});

app.patch('/api/admin/resources/:id', auth,(req,res)=>{
  const r=read(DB.resources); const i=r.findIndex(x=>x.id===req.params.id);
  if (i===-1) return res.status(404).json({error:'Not found.'});
  const {id,filename,url,size,ext,uploadedAt,uploadedBy,...allowed}=req.body;
  r[i]={...r[i],...allowed,updatedAt:new Date().toISOString()}; write(DB.resources,r);
  res.json({success:true,resource:r[i]});
});

app.delete('/api/admin/resources/:id', auth,(req,res)=>{
  const r=read(DB.resources); const i=r.findIndex(x=>x.id===req.params.id);
  if (i===-1) return res.status(404).json({error:'Not found.'});
  const cat=CATEGORIES[r[i].type]||CATEGORIES.pdf;
  const fp=path.join(ROOT,'uploads',cat.folder,r[i].filename);
  if (fs.existsSync(fp)) { try{fs.unlinkSync(fp);}catch(e){console.error(e);} }
  r.splice(i,1); write(DB.resources,r); res.json({success:true});
});

app.post('/api/admin/resources/bulk-delete', auth,(req,res)=>{
  const {ids}=req.body; if (!Array.isArray(ids)||!ids.length) return res.status(400).json({error:'No IDs provided.'});
  let r=read(DB.resources); let deleted=0;
  ids.forEach(id=>{ const i=r.findIndex(x=>x.id===id); if(i===-1)return; const cat=CATEGORIES[r[i].type]||CATEGORIES.pdf; const fp=path.join(ROOT,'uploads',cat.folder,r[i].filename); if(fs.existsSync(fp)){try{fs.unlinkSync(fp);}catch{}} r.splice(i,1); deleted++; });
  write(DB.resources,r); res.json({success:true,deleted});
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — GALLERY
// ═══════════════════════════════════════════════════════════════════
const galleryUpload=multer({storage:multer.diskStorage({destination(req,file,cb){cb(null,path.join(ROOT,'uploads','images'));},filename(req,file,cb){const ext=path.extname(file.originalname).toLowerCase();cb(null,`gallery_${Date.now()}_${Math.random().toString(36).slice(2,7)}${ext}`);}}),fileFilter:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();['.jpg','.jpeg','.png','.gif','.webp'].includes(ext)?cb(null,true):cb(new Error('Only image files allowed.'));},limits:{fileSize:10*1024*1024}});

app.post('/api/admin/gallery/upload', auth,(req,res)=>{
  galleryUpload.array('images',30)(req,res,err=>{
    if(err) return res.status(400).json({error:err.message});
    if(!req.files?.length) return res.status(400).json({error:'No images uploaded.'});
    const g=read(DB.gallery);
    const uploaded=req.files.map(file=>{ const item={id:uuidv4(),url:`/uploads/images/${file.filename}`,filename:file.filename,caption:req.body.caption||'',category:req.body.category||'general',visible:true,uploadedAt:new Date().toISOString()}; g.unshift(item); return item; });
    write(DB.gallery,g); res.json({success:true,count:uploaded.length,images:uploaded});
  });
});

app.get('/api/admin/gallery', auth,(req,res)=>res.json(read(DB.gallery).sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt))));
app.patch('/api/admin/gallery/:id', auth,(req,res)=>{ const g=read(DB.gallery); const i=g.findIndex(x=>x.id===req.params.id); if(i===-1)return res.status(404).json({error:'Not found.'}); g[i]={...g[i],...req.body}; write(DB.gallery,g); res.json({success:true,item:g[i]}); });
app.delete('/api/admin/gallery/:id', auth,(req,res)=>{ const g=read(DB.gallery); const i=g.findIndex(x=>x.id===req.params.id); if(i===-1)return res.status(404).json({error:'Not found.'}); const fp=path.join(ROOT,'uploads','images',g[i].filename); if(fs.existsSync(fp)){try{fs.unlinkSync(fp);}catch{}} g.splice(i,1); write(DB.gallery,g); res.json({success:true}); });

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — NOTICES
// ═══════════════════════════════════════════════════════════════════
app.get('/api/admin/notices', auth,(req,res)=>res.json(read(DB.notices).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))));
app.post('/api/admin/notices', auth,(req,res)=>{ const {title,body,type,expiresAt}=req.body; if(!title)return res.status(400).json({error:'Title required.'}); const n=read(DB.notices); const notice={id:uuidv4(),title:title.trim(),body:(body||'').trim(),type:type||'info',expiresAt:expiresAt||null,active:true,createdAt:new Date().toISOString(),createdBy:req.session.username}; n.unshift(notice); write(DB.notices,n); res.json({success:true,notice}); });
app.patch('/api/admin/notices/:id', auth,(req,res)=>{ const n=read(DB.notices); const i=n.findIndex(x=>x.id===req.params.id); if(i===-1)return res.status(404).json({error:'Not found.'}); n[i]={...n[i],...req.body,updatedAt:new Date().toISOString()}; write(DB.notices,n); res.json({success:true,notice:n[i]}); });
app.delete('/api/admin/notices/:id', auth,(req,res)=>{ const n=read(DB.notices); const i=n.findIndex(x=>x.id===req.params.id); if(i===-1)return res.status(404).json({error:'Not found.'}); n.splice(i,1); write(DB.notices,n); res.json({success:true}); });

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — TESTIMONIALS
// ═══════════════════════════════════════════════════════════════════
app.get('/api/admin/testimonials', auth,(req,res)=>res.json(read(DB.testimonials)));
app.post('/api/admin/testimonials', auth,(req,res)=>{ const {studentName,class:cls,text,rating,school}=req.body; if(!studentName||!text)return res.status(400).json({error:'Name and text required.'}); const t=read(DB.testimonials); const entry={id:uuidv4(),studentName:studentName.trim(),class:cls||'',school:school||'',text:text.trim(),rating:Math.min(5,Math.max(1,parseInt(rating)||5)),visible:true,createdAt:new Date().toISOString()}; t.unshift(entry); write(DB.testimonials,t); res.json({success:true,testimonial:entry}); });
app.patch('/api/admin/testimonials/:id', auth,(req,res)=>{ const t=read(DB.testimonials); const i=t.findIndex(x=>x.id===req.params.id); if(i===-1)return res.status(404).json({error:'Not found.'}); t[i]={...t[i],...req.body}; write(DB.testimonials,t); res.json({success:true,testimonial:t[i]}); });
app.delete('/api/admin/testimonials/:id', auth,(req,res)=>{ const t=read(DB.testimonials); const i=t.findIndex(x=>x.id===req.params.id); if(i===-1)return res.status(404).json({error:'Not found.'}); t.splice(i,1); write(DB.testimonials,t); res.json({success:true}); });

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — ADMISSIONS
// ═══════════════════════════════════════════════════════════════════
app.get('/api/admin/admissions', auth,(req,res)=>{ let a=read(DB.admissions); const{status,search}=req.query; if(status)a=a.filter(x=>x.status===status); if(search){const q=search.toLowerCase();a=a.filter(x=>x.name?.toLowerCase().includes(q)||x.mobile?.includes(q)||x.village?.toLowerCase().includes(q));} res.json(a.sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt))); });
app.patch('/api/admin/admissions/:id', auth,(req,res)=>{ const a=read(DB.admissions); const i=a.findIndex(x=>x.id===req.params.id); if(i===-1)return res.status(404).json({error:'Not found.'}); a[i]={...a[i],...req.body,updatedAt:new Date().toISOString()}; write(DB.admissions,a); res.json({success:true,admission:a[i]}); });
app.delete('/api/admin/admissions/:id', auth,(req,res)=>{ const a=read(DB.admissions); const i=a.findIndex(x=>x.id===req.params.id); if(i===-1)return res.status(404).json({error:'Not found.'}); a.splice(i,1); write(DB.admissions,a); res.json({success:true}); });

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — SETTINGS
// ═══════════════════════════════════════════════════════════════════
app.get('/api/admin/settings', auth,(req,res)=>res.json(readSettings()));
app.post('/api/admin/settings', auth,(req,res)=>{ const s={...readSettings(),...req.body,updatedAt:new Date().toISOString()}; write(DB.settings,s); res.json({success:true,settings:s}); });

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — STATS
// ═══════════════════════════════════════════════════════════════════
app.get('/api/admin/stats', auth,(req,res)=>{
  const r=read(DB.resources), a=read(DB.admissions), n=read(DB.notices), g=read(DB.gallery);
  const breakdown={};
  Object.keys(CATEGORIES).forEach(t=>{ breakdown[t]=r.filter(x=>x.type===t).length; });
  const storage=r.reduce((s,x)=>s+(x.size||0),0);
  res.json({
    totalResources:r.length, visibleResources:r.filter(x=>x.visible!==false).length,
    typeBreakdown:breakdown,
    totalAdmissions:a.length, newAdmissions:a.filter(x=>x.status==='new').length,
    contactedAdmissions:a.filter(x=>x.status==='contacted').length, enrolledAdmissions:a.filter(x=>x.status==='enrolled').length,
    totalDownloads:r.reduce((s,x)=>s+(x.downloads||0),0), totalViews:r.reduce((s,x)=>s+(x.views||0),0),
    activeNotices:n.filter(x=>x.active!==false).length, totalNotices:n.length, galleryImages:g.length,
    storageUsed:fmtBytes(storage), storageUsedBytes:storage,
    recentResources:r.sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt)).slice(0,5),
    recentAdmissions:a.sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt)).slice(0,5),
  });
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN — CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════════
app.post('/api/admin/change-password', auth,(req,res)=>{
  const {currentPassword,newPassword}=req.body;
  if (currentPassword!==ADMIN.password) return res.status(400).json({error:'Current password incorrect.'});
  if (!newPassword||newPassword.length<8) return res.status(400).json({error:'New password must be at least 8 characters.'});
  ADMIN.password=newPassword;
  res.json({success:true,message:'Password changed successfully! Update server.js to make it permanent.'});
});

// ═══════════════════════════════════════════════════════════════════
//  FRONTEND
// ═══════════════════════════════════════════════════════════════════
app.get('/admin',(req,res)=>res.sendFile(path.join(ROOT,'public','admin.html')));
app.get('/',(req,res)=>res.sendFile(path.join(ROOT,'public','index.html')));
app.get('*',(req,res)=>{ if(req.path.startsWith('/api'))return res.status(404).json({error:'API endpoint not found.'}); res.sendFile(path.join(ROOT,'public','index.html')); });

app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({error:'Server error',details:err.message}); });

app.listen(PORT,()=>{
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   GMT Tutorial Backend v2.0 — Running!       ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  🌐 Site  : http://localhost:${PORT}              ║`);
  console.log(`║  🔧 Admin : http://localhost:${PORT}/admin        ║`);
  console.log('║  👤 User  : gmt_admin                        ║');
  console.log('║  🔑 Pass  : GMT@2026#Naresh                  ║');
  console.log('║  📦 Max   : 100MB per file                   ║');
  console.log('╚══════════════════════════════════════════════╝\n');
});
