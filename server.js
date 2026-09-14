/**
 * GMT Tutorial Backend v2.2 (Production Ready)
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

// Multer Cloudinary Storage Setup
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // FIXED: Fallback safely to pdf category if type is undefined to prevent crashes
    const cat = CATEGORIES[req.body.type] || CATEGORIES.pdf;
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    const finalFilename = `${base}_${Date.now()}`;

    return {
      folder: `gmt_uploads/${cat.folder || 'general'}`,
      public_id: finalFilename,
      resource_type: 'auto',
      // FIXED: Corrected case sensitivity to lowercase allowed_formats
      allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'doc', 'docx', 'txt', 'rtf', 'epub', 'mp4', 'webm', 'ogg', 'mov', 'ppt', 'pptx']
    };
  }
});

// FIXED: Corrected logic inversion. Keeps valid file extensions instead of filtering them out.
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALL_EXTS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${ext} not allowed.`), false);
  }
};

const upload = multer({ storage: storage, fileFilter: fileFilter, limits: { fileSize: MAX_SIZE } });

// ── Auth middleware ────────────────────────────────────────────────────────
const auth=(req,res,next)=>{ if(req.session?.isAdmin) return next(); res.status(401).json({error:'Unauthorized'}); };

// ── Helper: build resource object ─────────────────────────────────────────
// FIXED: Maps resource URL property directly to cloud file path (file.path)
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
    filename:    file.filename || file.public_id,
    originalName:file.originalname,
    url:         file.path, // 👈 Cloudinary secure path
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
//  PUBLIC & UPLOAD ROUTES
// ═══════════════════════════════════════════════════════════════════
app.get('/api/settings',(req,res)=>res.json(readSettings()));

// FIXED: Re-injected the missing POST endpoint logic required to upload files to your server
app.post('/api/resources', auth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const dbData = read(DB.resources);
    const newResource = buildResource(req, req.file);
    
    dbData.push(newResource);
    write(DB.resources, dbData);
    
    res.json({ success: true, data: newResource });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/resources',(req,res)=>{
  let r=read(DB.resources).filter(r=>r.visible!==false);
  const {class:cls,subject,type,year,search,pinned}=req.query;
  if (cls)     r=r.filter(x=>x.class===cls||x.class==='all');
  if (subject) r=r.filter(x=>x.subject?.toLowerCase().includes(subject.toLowerCase()));
  if (type)    r=r.filter(x=>x.type===type);
  if (year)    r=r.filter(x=>x.year===year);
  if (pinned==='true') r=r.filter(x=>x.isPinned);
  if (search)  { const q=search.toLowerCase(); r=r.filter(x=>x.title.toLowerCase().includes(q)||x.description?.toLowerCase().includes(q)||x.subject?.toLowerCase().includes(q)||x.tags?.some(t=>t.toLowerCase().includes(q))); }
  
  // FIXED: Completed the broken array sorting structure missing from the initial prompt template
  r.sort((a,b)=>(b.isPinned?1:0)-(a.isPinned?1:0) || new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json(r);
});

// Server Start Setup
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
