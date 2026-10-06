/* =====================================================================
   دستیار هوشمند — موتور پرسش و پاسخ پیشرفته (کاملاً آفلاین)
   این فایل بعد از اسکریپت اصلی index.html بارگذاری می‌شود و فقط از
   داده‌ها و توابع خودِ برنامه (allRecords، appSettings، …) استفاده می‌کند.
   قابلیت‌ها: درک زبان محاوره‌ای فارسی با غلط‌یابی، بازه‌های زمانی
   (امروز/هفته‌ی قبل/۳ ماه اخیر/مهر/تاریخ دقیق)، فیلتر کد/پرسنل/بخش/عنوان/رنگ،
   تجمیع و رتبه‌بندی روی هر بُعد، مقایسه، «چرا؟»، پیش‌بینی فصلی، هدف،
   ناهنجاری‌ها، روزهای بیکار، کیفیت داده، و ادامه‌ی گفتگو (زمینه).
   ===================================================================== */
(function () {
    'use strict';
    try { localStorage.removeItem('sewing_ai_cfg_v1'); } catch (e) { /* کلید قدیمی */ }

    /* ============================ ابزارهای پایه ============================ */
    const WD = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
    const $ = (id) => document.getElementById(id);
    const num = (v) => Number(v) || 0;
    const sum = (a, fn) => a.reduce((x, r) => x + fn(r), 0);
    const f = (n) => formatNumber(Math.round(n));
    const fa = (s) => (appSettings && appSettings.numFormat === 'english') ? String(s) : toPersianDigits(String(s));
    const cur = () => (appSettings && appSettings.currency) || 'تومان';
    const money = (n) => f(n) + ' ' + cur();
    const pctS = (n) => f(n) + '٪';
    const JUDGED = ['به موقع', 'تاخیر', 'زودتر از موعد'];
    const esc = (s) => escapeHTML(s);
    const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    const uniq = (a) => a.filter((v, i) => a.indexOf(v) === i);

    /* نرمال‌سازی متن فارسی: یکسان‌سازی حروف، ارقام، نیم‌فاصله و پسوندها */
    function norm(s) {
        let t = toEnglishDigits(String(s == null ? '' : s));
        t = t.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[أإآ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ی').replace(/ة/g, 'ه')
            .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[\u200c\u200d\u200e\u200f]/g, ' ')
            .replace(/٫/g, '.').replace(/(\d)[,٬،](?=\d{3}(?!\d))/g, '$1').replace(/(\d)\.(?=\d)/g, '$1_D_')
            .replace(/[؟?!.:؛;,،()«»"'\[\]{}<>*+=~`^|\\]/g, ' ').replace(/_D_/g, '.')
            .replace(/\s+/g, ' ').trim().toLowerCase();
        t = t.replace(/(تر)ه(?= |$)/g, '$1').replace(/ (ها|های|ترین|تر)(?= |$)/g, '$1').replace(/(^| )(ن?می) (?=\S)/g, '$1$2');
        t = t.replace(/(^| )(یک|دو|سه|چهار|پنج) شنبه/g, '$1$2شنبه');
        return t;
    }
    function stem(w) {
        if (w.length >= 5) w = w.replace(/(های|ها)$/, ''); else if (w.length === 4) w = w.replace(/ها$/, '');
        if (w.length >= 5) w = w.replace(/(ات|ان)$/, '');
        if (w.length >= 5 && /ی$/.test(w)) w = w.slice(0, -1);
        return w;
    }
    function lev(a, b, max) {
        if (a === b) return 0;
        const la = a.length, lb = b.length;
        if (Math.abs(la - lb) > max) return max + 1;
        let prev = new Array(lb + 1), cur2 = new Array(lb + 1);
        for (let j = 0; j <= lb; j++) prev[j] = j;
        for (let i = 1; i <= la; i++) {
            cur2[0] = i; let rowMin = cur2[0];
            for (let j = 1; j <= lb; j++) {
                const c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
                cur2[j] = Math.min(prev[j] + 1, cur2[j - 1] + 1, prev[j - 1] + c);
                if (cur2[j] < rowMin) rowMin = cur2[j];
            }
            if (rowMin > max) return max + 1;
            const t = prev; prev = cur2; cur2 = t;
        }
        return prev[lb];
    }
    /* تطبیق تقریبی (غلط املایی): کلمه‌های کوتاه دقیق، بلندتر با یک یا دو خطا */
    function nearL(a, b) {
        if (a === b) return true;
        if (Math.min(a.length, b.length) < 4 || Math.max(a.length, b.length) < 5) return false;
        return lev(a, b, 1) <= 1 || (Math.min(a.length, b.length) >= 8 && lev(a, b, 2) <= 2);
    }
    function near(a, b) {
        if (a === b) return true;
        const L = Math.min(a.length, b.length);
        if (L < 5) return false;
        const m = L >= 9 ? 2 : 1;
        return lev(a, b, m) <= m;
    }

    const NW = { صفر: 0, یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, شانزده: 16, هفده: 17, هجده: 18, نوزده: 19, بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70, هشتاد: 80, نود: 90 };
    const NUNIT = ['روز', 'هفته', 'ماه', 'سال', 'تا', 'عدد', 'کد', 'کارکرد', 'کار', 'نفر', 'مورد', 'رکورد', 'برتر', 'میلیون', 'هزار', 'تومان', 'ریال', 'دانه', 'قطعه'];
    const NPREV = ['کد', 'بالای', 'زیر', 'حداقل', 'حداکثر', 'تاپ', 'top', 'برتر'];
    function wordNums(q) {
        const t = q.split(' '), out = [];
        for (let i = 0; i < t.length; i++) {
            const w = t[i];
            if (Object.prototype.hasOwnProperty.call(NW, w)) {
                let v = NW[w], used = 1;
                if (v >= 20 && t[i + 1] === 'و' && Object.prototype.hasOwnProperty.call(NW, t[i + 2]) && NW[t[i + 2]] < 10) { v += NW[t[i + 2]]; used = 3; }
                const nxt = t[i + used], prv = out[out.length - 1];
                if ((nxt && NUNIT.indexOf(nxt.replace(/ها$/, '')) >= 0) || (prv && NPREV.indexOf(prv) >= 0)) { out.push(String(v)); i += used - 1; continue; }
            }
            out.push(w);
        }
        return out.join(' ');
    }

    /* ============================ واژگان ============================ */
    const LX = {
        greet: ['سلام', 'درود', 'سلام علیکم', 'صبح بخیر', 'عصر بخیر', 'شب بخیر', 'وقت بخیر', 'هلو'],
        thanks: ['ممنون', 'مرسی', 'تشکر', 'دمت گرم', 'دستت درد', 'خسته نباشی', 'احسنت', 'متشکرم', 'ایول'],
        help: ['راهنما', 'کمک', 'چه کار میتونی', 'چیکار میتونی', 'چه کاری', 'چکار میکنی', 'چی بلدی', 'قابلیت', 'امکانات', 'چی بپرسم', 'help', 'دستورات', 'چه سوالی', 'چه چیزی بپرسم'],
        why: ['چرا', 'دلیل', 'علت', 'چطور شد', 'چی شد', 'چه شد', 'عامل'],
        forecast: ['پیشبینی', 'پیش بینی', 'پایان ماه', 'اخر ماه', 'تا اخر', 'تا پایان', 'اخر هفته', 'پایان هفته', 'تخمین', 'برآورد', 'براورد', 'چقدر میشه', 'چقدر خواهد شد', 'حدود چقدر', 'تا ته ماه'],
        goal: ['هدف', 'تارگت', 'به هدف برسم', 'چقدر مونده', 'چقدر مانده', 'کمبود', 'تا هدف'],
        active: ['جاری', 'در حال انجام', 'در حال کار', 'کار فعلی', 'فعلی', 'پیشرفت', 'موعد', 'ددلاین', 'مهلت', 'تموم نشده', 'تمام نشده', 'نیمه کاره', 'باز', 'الان'],
        compare: ['مقایسه', 'نسبت به', 'در برابر', 'در مقابل', 'فرق', 'تفاوت', 'بهتر شده', 'بدتر شده', 'رشد', 'کاهش', 'افزایش', 'نسبت'],
        analysis: ['تحلیل', 'روند', 'ارزیابی', 'عملکرد', 'وضعیت کلی', 'بررسی کن', 'گزارش کامل', 'گزارش جامع', 'دید کلی', 'نقاط ضعف', 'نقاط قوت', 'چطور بودم', 'چطوره', 'اوضاع', 'وضع'],
        summary: ['خلاصه', 'گزارش', 'وضعیت', 'چه خبر', 'نمای کلی'],
        anomaly: ['غیرعادی', 'غیر عادی', 'عجیب', 'ناهنجار', 'نامعمول', 'غیرطبیعی', 'غیر طبیعی', 'پرت', 'استثنا', 'مشکوک'],
        streak: ['پشت سر هم', 'متوالی', 'پیاپی', 'استریک', 'بی وقفه', 'مداوم'],
        idle: ['بدون کار', 'بیکار', 'بیکاره', 'بیکارن', 'بیکارند', 'بی کار', 'کار نکردم', 'نیومدم', 'غایب', 'روز خالی', 'نبود', 'بدون ثبت', 'ثبت نشده', 'کار نکرد', 'روز بی کار'],
        quality: ['بررسی داده', 'سلامت داده', 'ناقص', 'خطا', 'اشتباه', 'تکراری', 'بدون قیمت', 'قیمت ندارد', 'قیمت نداره', 'قیمت نامعلوم', 'بدون مدت', 'کیفیت داده'],
        tips: ['پیشنهاد', 'توصیه', 'هشدار', 'نکته', 'مشکل', 'چه کنم', 'چکار کنم', 'چیکار کنم', 'راهکار', 'بهبود', 'چطور بهتر', 'چطور افزایش', 'چه کار کنم', 'راه حل'],
        last: ['اخرین', 'جدیدترین', 'تازه ترین', 'اخیرا ثبت'],
        first: ['اولین', 'قدیمی ترین', 'نخستین'],
        list: ['لیست', 'فهرست', 'نشان بده', 'نمایش بده', 'نشونم بده', 'نشونم', 'چه کارهایی', 'کدوم کارها', 'کدام کارها'],
        find: ['پیدا کن', 'جستجو', 'سرچ', 'دنبال', 'کجاست', 'پیدا'],
        who: ['چه کسی', 'کی', 'کیه', 'کیا', 'کدام کارگر', 'کدوم کارگر', 'کدام نفر', 'کدوم نفر', 'کدام پرسنل', 'چه کارگری', 'کدام کارمند'],
        more: ['بیشتر', 'بیشتر بگو', 'ادامه', 'جزئیات', 'بیشتر توضیح', 'بیشتر نشان بده', 'کامل تر', 'توضیح بده'],
        pron: ['همین', 'اون', 'ان', 'همان', 'اینو', 'اونو', 'همینو'],
        d_status: ['وضعیت تحویل'],
        m_perhour: ['در ساعت', 'بازده', 'بازدهی', 'بهره وری', 'راندمان', 'به صرفه', 'سودآور', 'ارزش هر ساعت', 'درامد هر ساعت', 'درامد ساعتی', 'ارزش ساعتی', 'سود ده'],
        m_hours: ['چند ساعت', 'ساعت کار', 'مجموع ساعت', 'ساعات کار'],
        m_days: ['چند روز', 'تعداد روز', 'روز کاری', 'روزهای کاری', 'چند روزه'],
        m_count: ['تعداد کارکرد', 'چند کارکرد', 'چند تا کار', 'چندتا کار', 'چند کار', 'چند رکورد', 'تعداد رکورد', 'تعداد کار', 'تعداد ثبت', 'کارکرد', 'رکورد', 'چندتا', 'چند تا', 'چند مورد'],
        m_qty: ['مجموع تعداد', 'تعداد قطعه', 'چند عدد', 'تعداد', 'قطعه', 'دانه', 'تولید', 'عدد', 'حجم'],
        m_income: ['درامد', 'ارزش', 'فروش', 'پول', 'مبلغ', 'دستمزد', 'مزد', 'کسب', 'در اوردم', 'دراوردم', 'سود', 'تومان', 'ریال'],
        m_late: ['تاخیر', 'دیرکرد', 'معوق', 'دیر', 'عقب'],
        m_ontime: ['به موقع', 'بموقع', 'سر وقت', 'زودتر', 'تحویل به موقع', 'وقت شناس', 'انضباط'],
        m_dur: ['مدت زمان', 'مدت', 'زمان انجام', 'طول کشید', 'چقدر طول', 'زمان کار', 'سرعت'],
        m_unit: ['قیمت واحد', 'نرخ واحد', 'قیمت هر', 'تعرفه'],
        rate: ['نرخ', 'درصد', 'چند درصد'],
        avg: ['میانگین', 'متوسط', 'معدل', 'به طور متوسط', 'بطور متوسط', 'سرانه', 'به ازای'],
        d_weekday: ['روز هفته', 'روزهای هفته', 'کدام روز هفته', 'کدوم روز هفته'],
        d_day: ['هر روز', 'روزانه', 'روز به روز', 'روزبه روز', 'به تفکیک روز', 'برای هر روز', 'کدام روز', 'کدوم روز', 'چه روزی', 'روز'],
        d_week: ['هر هفته', 'هفتگی', 'هفته به هفته', 'به تفکیک هفته', 'کدام هفته', 'کدوم هفته', 'هفته'],
        d_month: ['هر ماه', 'ماهانه', 'ماه به ماه', 'به تفکیک ماه', 'کدام ماه', 'کدوم ماه', 'ماه'],
        d_hour: ['ساعات', 'کدام ساعت', 'کدوم ساعت', 'چه ساعتی', 'هر ساعت', 'ساعت پرکار', 'ساعت کاری', 'ساعت'],
        d_code: ['هر کد', 'کدام کد', 'کدوم کد', 'چه کدی', 'به تفکیک کد', 'کد'],
        d_worker: ['پرسنل', 'پرسنله', 'کارگر', 'کارگره', 'کارگرا', 'کارمنده', 'نفرات', 'کارمند', 'هر نفر', 'هر کارگر', 'اپراتور', 'نیرو'],
        d_section: ['بخش', 'قسمت', 'سالن', 'هر بخش'],
        d_color: ['رنگ', 'هر رنگ', 'کدام رنگ'],
        d_title: ['هر مدل', 'کدام مدل', 'مدل', 'کدام محصول', 'هر محصول', 'محصول', 'عنوان'],
        sup_max: ['بیشترین', 'پرکارترین', 'پردرامدترین', 'بهترین', 'برترین', 'برتر', 'تاپ', 'top', 'ماکزیمم', 'حداکثر', 'پیک', 'بالاترین', 'گرانترین', 'موفق ترین', 'بیشتر', 'پرسودترین', 'پربازده ترین', 'پرکار', 'پردرامد', 'پرکارتر', 'پردرامدتر', 'بهتر', 'پرتر', 'پربازده تر'],
        sup_min: ['کمترین', 'ضعیف ترین', 'بدترین', 'کم کار', 'حداقل', 'پایین ترین', 'مینیمم', 'کمتر', 'ارزانترین', 'کم درامد', 'کم بازده ترین'],
        busy: ['پرکار', 'پرکارترین', 'پرکارتر', 'کم کار'],
        st_late: ['تاخیردار', 'تاخیر دار', 'با تاخیر', 'دیر تحویل', 'دیر تحویل شده'],
        st_early: ['زودتر از موعد', 'زود تحویل'],
        stop: ['در', 'از', 'به', 'را', 'که', 'با', 'برای', 'این', 'ان', 'و', 'یا', 'من', 'ما', 'شما', 'چه', 'چی', 'هم', 'هر', 'همه', 'تا', 'بر', 'ی', 'است', 'هست', 'بود', 'شد', 'میشه', 'کرد', 'کردم', 'کنم', 'کن', 'بده', 'بگو', 'بگین', 'لطفا', 'یه', 'رو', 'اون', 'بعد', 'قبل', 'هنوز', 'اگه', 'اگر', 'ولی', 'اما', 'پس', 'فقط', 'خیلی', 'کنید', 'کنیم', 'دارم', 'داشتم', 'دارد', 'داره', 'بوده', 'باشه', 'باید', 'میخوام', 'میخواهم', 'میتونم', 'کار', 'کارا', 'چقدر', 'چند', 'کدام', 'کدوم', 'چطور', 'چگونه', 'آیا', 'ایا', 'هستم', 'بود', 'بودم', 'شده', 'میشود', 'اینجا', 'خب', 'خوب', 'لطف', 'ببین', 'بزن', 'بزار', 'ممکنه', 'بنویس', 'می', 'نمی', 'ها', 'تر', 'بیشتر', 'کمتر', 'همین', 'ثبت', 'کارکرد', 'کدی']
    };
    /* گسترش واژگان: مترادف‌ها و عبارت‌های محاوره‌ای عمومی (مناسب همه‌ی مشاغل، نه فقط خیاطی) */
    const LX_EXTRA = {
        greet: ['روز بخیر', 'سلام خوبی', 'سلام وقتت بخیر'],
        thanks: ['سپاس', 'سپاسگزارم', 'ممنونم', 'دستت طلا', 'عالی بود', 'قربانت', 'مخلصیم'],
        help: ['راهنمایی', 'کمکم کن', 'چه سوالاتی', 'چه چیزایی بلدی', 'چه کارهایی بلدی'],
        why: ['به چه دلیل', 'برای چی', 'علتش', 'دلیلش'],
        forecast: ['اخر ماه چقدر', 'تا اخر ماه', 'در پایان ماه', 'چقدر در میارم'],
        goal: ['رسیدن به هدف', 'هدف ماهانه', 'هدف هفتگی', 'هدف درامد'],
        active: ['کار در دست', 'در دست انجام', 'کار الان', 'در دست اقدام'],
        compare: ['در مقایسه با', 'اختلاف', 'پیشرفت کردم'],
        analysis: ['گزارش عملکرد', 'ارزیابی کلی', 'کارنامه', 'وضعیت من', 'حال و روز'],
        summary: ['خلاصه وضعیت', 'چکیده', 'مرور', 'یک نگاه'],
        tips: ['راه بهبود', 'برای بهتر شدن', 'ایده', 'چه توصیه ای'],
        find: ['جست و جو', 'پیدا بکن', 'کجا بود', 'کدوم بود'],
        who: ['چه نفری'],
        m_perhour: ['درامد ساعتی', 'دستمزد ساعتی', 'ساعتی'],
        m_hours: ['مجموع زمان', 'کل ساعت', 'ساعت کارکرد'],
        m_days: ['روز حضور', 'روزهای حضور', 'روزهای فعال', 'چند روز کار'],
        m_count: ['چند پروژه', 'تعداد پروژه', 'چند سفارش', 'تعداد سفارش', 'چند بار', 'تعداد دفعات'],
        m_qty: ['تیراژ', 'تعداد کل', 'خروجی'],
        m_income: ['عایدی', 'دریافتی', 'گردش مالی', 'منفعت', 'چقدر پول', 'حاصل کار'],
        m_late: ['دیرتحویل'],
        m_ontime: ['وقت شناسی', 'به وقت'],
        m_dur: ['زمان صرف شده', 'چقدر وقت', 'وقت گرفت', 'چقدر زمان', 'زمان متوسط'],
        m_unit: ['قیمت هر واحد', 'نرخ هر', 'قیمت یکی', 'تعرفه واحد'],
        avg: ['به طور معمول', 'معمولا'],
        sup_max: ['قوی ترین', 'رکوردم', 'سودآورترین', 'پرتیراژترین'],
        sup_min: ['ضعیفتر', 'کم بازده', 'کمبازده', 'کم سودترین'],
        d_worker: ['کارکنان', 'کارکن', 'تیم', 'اعضا', 'همکار', 'استادکار', 'شاگرد'],
        d_section: ['دپارتمان', 'شعبه', 'خط تولید', 'ایستگاه', 'گروه کاری', 'واحد کاری'],
        d_title: ['کدام نوع', 'هر نوع', 'کدام طرح', 'هر طرح', 'کدام کالا', 'هر کالا', 'کدام جنس', 'هر جنس'],
        idle: ['روز تعطیل', 'کار نداشتم', 'بی فعالیت', 'فعالیت نداشتم', 'بدون فعالیت'],
        streak: ['پشت هم', 'پی در پی', 'روزهای متوالی'],
        anomaly: ['نوسان', 'جهش', 'افت شدید', 'اشتباه تایپی', 'تایپی'],
        quality: ['ثبت اشتباه', 'داده اشتباه', 'مشکل داده']
    };
    Object.keys(LX_EXTRA).forEach(k => { LX[k] = LX[k].concat(LX_EXTRA[k]); });
    const PC = {};
    function ph(p) {
        let c = PC[p];
        if (!c) { const n = norm(p); c = PC[p] = { s: ' ' + n.split(' ').map(stem).join(' ') + ' ', single: n.indexOf(' ') < 0 ? stem(n) : null }; }
        return c;
    }
    function mkQ(q) { const toks = q.split(' ').filter(Boolean); return { toks, W: ' ' + toks.map(stem).join(' ') + ' ' }; }
    const has = (Q, key) => LX[key].some(p => Q.W.indexOf(ph(p).s) >= 0);
    function take(Q, key, fuzzy) {
        let hit = false;
        for (const p of LX[key]) {
            const c = ph(p);
            if (Q.W.indexOf(c.s) >= 0) { hit = true; Q.W = Q.W.split(c.s).join(' '); }
            else if (fuzzy && c.single && c.single.length >= 5) {
                const ts = Q.W.trim().split(' ');
                for (let i = 0; i < ts.length; i++) if (ts[i].length >= 4 && nearL(ts[i], c.single)) { hit = true; ts[i] = ''; Q.W = ' ' + ts.filter(Boolean).join(' ') + ' '; break; }
            }
        }
        return hit;
    }

    /* ============================ لایه‌ی داده ============================ */
    function durMin(s) { const m = /^(\d{1,4}):(\d{2})$/.exec(toEnglishDigits(String(s || '')).trim()); return m ? (+m[1]) * 60 + (+m[2]) : null; }
    const pad2 = (n) => String(n).padStart(2, '0');

    /* کش رکوردهای تحلیل‌شده: فقط رکوردِ تازه یا ویرایش‌شده دوباره محاسبه می‌شود (برای هزاران رکورد سریع می‌ماند) */
    const BC = new WeakMap(), NC = new Map();
    const nrm = (v) => { const k = String(v == null ? '' : v); let n = NC.get(k); if (n === undefined) { n = norm(k); if (NC.size > 4000) NC.clear(); NC.set(k, n); } return n; };
    function baseOf(r, wdOf) {
        const sig = [r.date, r.time, r.quantity, r.unitPrice, r.totalPrice, r.status, r.itemCode, r.itemTitle, r.itemColor, r.durationTime, r.monthKey, r.finishedDate, r.nextCodeStartDate, r.workDuration].join('\u0001');
        const c = BC.get(r); if (c && c.sig === sig) return c.o;
        const jdn = parseJalaliDateToJdn(r.date) || 0, tm = /^(\d{1,2})/.exec(toEnglishDigits(String(r.time || ''))), dp = toEnglishDigits(String(r.date || '')).split('/');
        const o = {
            r, jdn, wd: jdn ? wdOf(jdn) : -1, dom: jdn ? (parseInt(dp[2], 10) || 0) : 0, hour: tm ? Math.min(23, +tm[1]) : -1, mk: r.monthKey,
            inc: typeof r.totalPrice === 'number' ? r.totalPrice : null, qty: num(r.quantity), unit: num(r.unitPrice),
            code: nrm(r.itemCode), codeRaw: String(r.itemCode || ''), title: r.itemTitle || '', color: r.itemColor || '',
            wn: '', wnn: '', sec: '', secn: '', late: r.status === 'تاخیر', judged: JUDGED.indexOf(r.status) >= 0, early: r.status === 'زودتر از موعد',
            dur: durMin(r.durationTime), hay: nrm([r.itemCode, r.itemTitle, r.itemColor].join(' ')),
            open: !r.nextCodeStartDate && !r.finishedDate && !!r.workDuration
        };
        BC.set(r, { sig, o }); return o;
    }
    let BUILD = null;
    function buildSig() {
        let sg = 0, n = allRecords.length; for (let i = 0; i < n; i++) sg += (allRecords[i].updatedAt || 0) % 1e9 + i;
        let m = ''; try { m = (typeof mgrOn === 'function' && mgrOn()) ? JSON.stringify([mgr().workers.map(w => [w.id, w.name, w.active, w.sectionId]), mgr().sections.map(x => [x.id, x.name])]) : ''; } catch (e) { m = 'x'; }
        return [n, sg, m, getCurrentJalaliInfo().fullDateStr, appSettings.incomeGoalMonthly, appSettings.incomeGoalWeekly, appSettings.currency, appSettings.numFormat, new Date().getHours()].join('|');
    }
    function build() {
        const sg = buildSig(); if (BUILD && BUILD.sg === sg) return BUILD.S;
        const S = build0(); BUILD = { sg, S }; return S;
    }
    function build0() {
        const jc = getCurrentJalaliInfo(), emp = (typeof mgrOn === 'function') && mgrOn();
        const T = parseJalaliDateToJdn(jc.fullDateStr) || 0, jy = parseInt(jc.yearEn, 10), jm = jc.monthNum;
        const mStart = j2d(jy, jm, 1), mEnd = (jm === 12 ? j2d(jy + 1, 1, 1) : j2d(jy, jm + 1, 1)) - 1;
        const wdMemo = {};
        const wdOf = (j) => (wdMemo[j] !== undefined ? wdMemo[j] : (wdMemo[j] = saturdayBasedDayIndex(j)));
        const recs = allRecords.filter(r => emp || recOwnerKey(r) === '').map(r => {
            const o = baseOf(r, wdOf);
            o.wn = emp ? (mgrRecWorker(r) || '') : ''; o.wnn = norm(o.wn);
            o.sec = (emp && typeof mgrRecSection === 'function') ? (mgrRecSection(r) || '') : ''; o.secn = norm(o.sec);
            return o;
        });
        const prevKey = mkAdd(jc.monthKey, -1);
        const S = { jc, emp, T, jy, jm, mStart, mEnd, wdOf, recs, day: d2j(T).jd, curKey: jc.monthKey, prevKey, dim: mEnd - mStart + 1 };
        S.m = recs.filter(x => x.mk === S.curKey); S.p = recs.filter(x => x.mk === prevKey);
        S.ws = T - wdOf(T);
        S.act = getCurrentActiveRecord();
        S.prog = S.act ? computeRecordProgress(S.act) : null;
        S.goal = num(appSettings.incomeGoalMonthly); S.goalW = num(appSettings.incomeGoalWeekly);
        S.workers = emp && mgr() && Array.isArray(mgr().workers) ? mgr().workers : [];
        S.sections = emp && mgr() && Array.isArray(mgr().sections) ? mgr().sections : [];
        return S;
    }
    function mkAdd(key, d) { const p = key.split('-').map(Number); const i = p[0] * 12 + (p[1] - 1) + d; return Math.floor(i / 12) + '-' + (i % 12 + 1); }
    const mkLabel = (key) => { const p = key.split('-').map(Number); return (PERSIAN_MONTHS[p[1] - 1] || '') + ' ' + fa(p[0]); };
    const mkOrd = (key) => { const p = key.split('-').map(Number); return p[0] * 12 + p[1]; };
    function dateStr(j) { const d = d2j(j); return fa(d.jy + '/' + pad2(d.jm) + '/' + pad2(d.jd)); }
    function dayShort(S, j) { const d = d2j(j); return WD[S.wdOf(j)] + ' ' + fa(d.jd + '/' + d.jm); }
    function dayLong(S, j) { const d = d2j(j); return WD[S.wdOf(j)] + ' ' + fa(d.jd) + ' ' + (PERSIAN_MONTHS[d.jm - 1] || ''); }

    function agg(list) {
        const o = { n: list.length, inc: 0, qty: 0, late: 0, judged: 0, priced: 0, durSum: 0, durN: 0, unitSum: 0, unitN: 0, hInc: 0, hDur: 0, dset: {} };
        list.forEach(x => {
            if (x.inc !== null) { o.inc += x.inc; o.priced++; }
            o.qty += x.qty; if (x.judged) { o.judged++; if (x.late) o.late++; }
            if (x.dur !== null) { o.durSum += x.dur; o.durN++; if (x.inc !== null && x.dur > 0) { o.hInc += x.inc; o.hDur += x.dur; } }
            if (x.unit > 0) { o.unitSum += x.unit; o.unitN++; }
            if (x.jdn) o.dset[x.jdn] = 1;
        });
        o.days = Object.keys(o.dset).length;
        return o;
    }
    const NA = null;
    const METRIC = {
        income: { l: (S) => S.emp ? 'ارزش کار' : 'درآمد', get: a => a.inc, fmt: money, up: true },
        count: { l: () => 'تعداد کارکرد', get: a => a.n, fmt: v => f(v) + ' کارکرد', up: true },
        qty: { l: () => 'مجموع تعداد', get: a => a.qty, fmt: v => f(v) + ' عدد', up: true },
        late: { l: () => 'تعداد تاخیر', get: a => a.late, fmt: v => f(v) + ' مورد', up: false },
        latepct: { l: () => 'نرخ تاخیر', get: a => a.judged ? a.late / a.judged * 100 : NA, fmt: pctS, up: false, rate: true },
        ontimepct: { l: () => 'نرخ تحویل به‌موقع', get: a => a.judged ? (a.judged - a.late) / a.judged * 100 : NA, fmt: pctS, up: true, rate: true },
        avgval: { l: () => 'میانگین ارزش هر کارکرد', get: a => a.priced ? a.inc / a.priced : NA, fmt: money, up: true },
        avgqty: { l: () => 'میانگین تعداد هر کارکرد', get: a => a.n ? a.qty / a.n : NA, fmt: v => f(v) + ' عدد', up: true },
        avgdur: { l: () => 'میانگین مدت انجام', get: a => a.durN ? a.durSum / a.durN : NA, fmt: v => formatMinutesDuration(v), up: false },
        avgunit: { l: () => 'میانگین قیمت واحد', get: a => a.unitN ? a.unitSum / a.unitN : NA, fmt: money, up: true },
        perhour: { l: () => 'بازده ساعتی', get: a => a.hDur > 0 ? a.hInc / (a.hDur / 60) : NA, fmt: v => money(v) + ' در ساعت', up: true },
        hours: { l: () => 'مجموع ساعت کار', get: a => a.durN ? a.durSum / 60 : NA, fmt: v => f(v) + ' ساعت', up: true },
        days: { l: () => 'تعداد روزهای دارای ثبت', get: a => a.days, fmt: v => f(v) + ' روز', up: true },
        perday: { l: (S) => (S.emp ? 'میانگین ارزش کار' : 'میانگین درآمد') + ' هر روز کاری', get: a => a.days ? a.inc / a.days : NA, fmt: money, up: true },
        perdayn: { l: () => 'میانگین کارکرد هر روز کاری', get: a => a.days ? a.n / a.days : NA, fmt: v => f(v) + ' کارکرد', up: true }
    };
    const mval = (key, a) => { const v = METRIC[key].get(a); return (v === null || v === undefined || !isFinite(v)) ? null : v; };

    /* ---------- بازه‌های زمانی ---------- */
    const RG = {
        days: (a, b, label) => ({ kind: 'days', from: a, to: b, label }),
        months: (keys, label, upTo) => ({ kind: 'months', keys, label, upTo: upTo || 0 }),
        year: (y, label) => ({ kind: 'year', y: String(y), label }),
        all: () => ({ kind: 'all', label: 'کل دوره' })
    };
    function inR(x, rg) {
        if (!rg) return true;
        switch (rg.kind) {
            case 'days': return x.jdn >= rg.from && x.jdn <= rg.to;
            case 'months': return rg.keys.indexOf(x.mk) >= 0 && (!rg.upTo || x.dom <= rg.upTo);
            case 'year': return String(x.mk).split('-')[0] === rg.y;
            default: return true;
        }
    }
    function prevOf(rg, S) {
        if (!rg) return null;
        if (rg.kind === 'days') {
            const len = rg.to - rg.from + 1;
            if (len === 1) return RG.days(rg.from - 1, rg.from - 1, rg.from === S.T ? 'دیروز' : 'روز قبل');
            if (rg.from === S.ws && rg.to === S.T) return RG.days(S.ws - 7, S.ws - 7 + (S.T - S.ws), 'هفته‌ی قبل (همان تعداد روز)');
            if (len === 7 && rg.from === S.ws - 7) return RG.days(rg.from - 7, rg.to - 7, 'دو هفته قبل');
            return RG.days(rg.from - len, rg.from - 1, 'بازه‌ی قبلی (' + fa(len) + ' روز)');
        }
        if (rg.kind === 'months') {
            const n = rg.keys.length, keys = rg.keys.map(k => mkAdd(k, -n));
            const partial = n === 1 && rg.keys[0] === S.curKey && !rg.upTo;
            return RG.months(keys, n === 1 ? (partial ? mkLabel(keys[0]) + ' (' + fa(S.day) + ' روز اول)' : mkLabel(keys[0])) : fa(n) + ' ماه قبل‌تر', partial ? S.day : rg.upTo);
        }
        if (rg.kind === 'year') return RG.year(+rg.y - 1, 'سال ' + fa(+rg.y - 1));
        return null;
    }

    const MONTHS_N = PERSIAN_MONTHS.map(norm);
    function extractRanges(q, S) {
        const found = [];
        q = ' ' + q + ' ';
        const T = S.T, curY = S.jy, curM = S.jm;
        const mkNow = S.curKey;
        const D = (y, m, d) => { try { return j2d(+y, +m, +d); } catch (e) { return 0; } };
        const valid = (m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
        const PATS = [
            [/ (?:از )?(\d{3,4})\/(\d{1,2})\/(\d{1,2}) (?:تا|الی) (\d{3,4})\/(\d{1,2})\/(\d{1,2})(?= )/g, g => { const a = D(g[0], g[1], g[2]), b = D(g[3], g[4], g[5]); return (a && b && valid(+g[1], +g[2]) && valid(+g[4], +g[5])) ? RG.days(Math.min(a, b), Math.max(a, b), 'از ' + dateStr(Math.min(a, b)) + ' تا ' + dateStr(Math.max(a, b))) : null; }],
            [/ (\d{3,4})\/(\d{1,2})\/(\d{1,2})(?= )/g, g => { const a = D(g[0], g[1], g[2]); return (a && valid(+g[1], +g[2])) ? RG.days(a, a, dateStr(a)) : null; }],
            [/ (\d{1,2})\/(\d{1,2})(?= )/g, g => { if (!valid(+g[0], +g[1])) return null; const a = D(curY, g[0], g[1]); return a ? RG.days(a, a, dateStr(a)) : null; }],
            [/ (\d{1,3}) (روز|هفته|ماه|سال) (?:ی )?(اخیر|گذشته|اخر)(?= )/g, g => { const n = +g[0]; if (!n) return null; const u = g[1];
                if (u === 'روز') return RG.days(T - n + 1, T, fa(n) + ' روز اخیر');
                if (u === 'هفته') return RG.days(T - 7 * n + 1, T, fa(n) + ' هفته‌ی اخیر');
                const cnt = u === 'ماه' ? n : 12 * n, keys = []; for (let i = 0; i < cnt; i++) keys.push(mkAdd(mkNow, -i));
                return RG.months(keys, fa(cnt) + ' ماه اخیر'); }],
            [/ (\d{1,3}) (روز|هفته|ماه) (?:ی )?(پیش|قبل)(?= )/g, g => { const n = +g[0], u = g[1];
                if (u === 'روز') return RG.days(T - n, T - n, fa(n) + ' روز پیش (' + dateStr(T - n) + ')');
                if (u === 'هفته') return RG.days(S.ws - 7 * n, S.ws - 7 * n + 6, fa(n) + ' هفته پیش');
                const k = mkAdd(mkNow, -n); return RG.months([k], mkLabel(k)); }],
            [/ (روز|هفته|ماه) (?:ی )?اخیر(?= )/g, g => g[0] === 'روز' ? RG.days(T, T, 'امروز') : g[0] === 'هفته' ? RG.days(T - 6, T, '۷ روز اخیر') : RG.days(T - 29, T, '۳۰ روز اخیر')],
            [/ پریروز(?= )/g, () => RG.days(T - 2, T - 2, 'پریروز')],
            [/ دیروز(?= )/g, () => RG.days(T - 1, T - 1, 'دیروز')],
            [/ امروز(?= )/g, () => RG.days(T, T, 'امروز')],
            [/ (?:این|همین) هفته(?= )/g, () => RG.days(S.ws, T, 'این هفته')],
            [/ هفته (?:ی )?جاری(?= )/g, () => RG.days(S.ws, T, 'این هفته')],
            [/ هفته (?:ی )?(?:قبل|گذشته|پیش|پیشین)(?= )/g, () => RG.days(S.ws - 7, S.ws - 1, 'هفته‌ی قبل')],
            [/ (?:این|همین) ماه(?= )/g, () => RG.months([mkNow], 'این ماه (' + mkLabel(mkNow) + ')')],
            [/ ماه (?:ی )?جاری(?= )/g, () => RG.months([mkNow], 'این ماه (' + mkLabel(mkNow) + ')')],
            [/ ماه (?:ی )?(?:قبل|گذشته|پیش|پیشین)(?= )/g, () => { const k = mkAdd(mkNow, -1); return RG.months([k], 'ماه قبل (' + mkLabel(k) + ')'); }],
            [/ (?:امسال|سال جاری|این سال)(?= )/g, () => RG.year(curY, 'امسال (' + fa(curY) + ')')],
            [/ (?:پارسال|سال (?:ی )?(?:قبل|گذشته))(?= )/g, () => RG.year(curY - 1, 'سال ' + fa(curY - 1))],
            [new RegExp(' (?:ماه )?(' + MONTHS_N.join('|') + ')(?: ماه)?(?: (1[34]\\d\\d))?(?= )', 'g'), g => { const mi = MONTHS_N.indexOf(g[0]) + 1; if (!mi) return null; const y = g[1] ? +g[1] : (mi > curM ? curY - 1 : curY); const k = y + '-' + mi; return RG.months([k], mkLabel(k)); }],
            [/ (1[34]\d\d)(?= )/g, g => RG.year(+g[0], 'سال ' + fa(g[0]))],
            [/ (?:تا کنون|تاکنون|تا حالا|تا الان|از ابتدا|از اول|در کل|همیشه|کل دوره|از شروع)(?= )/g, () => RG.all()]
        ];
        PATS.forEach(([re, fn]) => {
            q = q.replace(re, function () {
                const a = [].slice.call(arguments), off = a[a.length - 2], m = a[0];
                const rg = fn(a.slice(1, a.length - 2));
                if (rg) { found.push({ off, rg }); return ' '.repeat(m.length); }
                return m;
            });
        });
        found.sort((a, b) => a.off - b.off);
        return { q: q.replace(/\s+/g, ' ').trim(), ranges: found.map(x => x.rg) };
    }

    /* ============================ تحلیل پرسش ============================ */
    function vocab(S) {
        if (S.__V) return S.__V;
        const V = S.__V = { codes: {}, tok: {}, workers: [], sections: [] };
        S.recs.forEach(x => {
            if (x.code) V.codes[x.code] = x.codeRaw;
            (x.title + ' ' + x.color).split(/[\s\u200c]+/).forEach(w => { const n = stem(norm(w)); if (n.length >= 3 && !/^\d+$/.test(n)) V.tok[n] = (V.tok[n] || 0) + 1; });
        });
        const seen = {};
        S.workers.forEach(w => { if (w && w.name) { const n = norm(w.name); if (!seen[n]) { seen[n] = 1; V.workers.push({ name: w.name, n, toks: n.split(' ').filter(t => t.length >= 2) }); } } });
        S.recs.forEach(x => { if (x.wn && !seen[x.wnn]) { seen[x.wnn] = 1; V.workers.push({ name: x.wn, n: x.wnn, toks: x.wnn.split(' ').filter(t => t.length >= 2) }); } });
        S.sections.forEach(s => { if (s && s.name) { const n = norm(s.name); V.sections.push({ name: s.name, n, toks: n.split(' ').filter(t => t.length >= 2) }); } });
        return V;
    }
    const nearN = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && near(a, b));

    function newFilters() { return { codes: [], workers: [], sections: [], status: null, wd: null, text: [], minV: null, maxV: null, minQ: null, maxQ: null }; }

    function parse(raw, S, V) {
        let q = wordNums(norm(raw));
        const P = { raw, filters: newFilters(), range: null, ranges: [], metric: null, metricExplicit: false, dim: null, sup: null, topN: null, intent: null, ambig: null, unknown: [], flags: {}, entities: 0 };
        q = q.split(' ').map(w => { if (w.length < 4 || w.length > 7) return w; for (const k of ['امروز', 'دیروز', 'پریروز', 'پارسال', 'امسال']) if (w !== k && lev(w, k, 1) <= 1 && !(V.tok[stem(w)])) return k; return w; }).join(' ');
        const ex = extractRanges(q, S); q = ex.q; P.ranges = ex.ranges; P.range = ex.ranges[0] || null;
        const F = P.filters;

        /* آستانه‌ها: «بالای ۲ میلیون»، «حداقل ۵ عدد» */
        q = (' ' + q + ' ').replace(/ (بالای|بالاتر از|بیشتر از|بیش از|حداقل|کمتر از|زیر|پایین تر از|حداکثر|تا سقف) (\d+(?:\.\d+)?) ?(میلیون|هزار|میلیارد|تومان|تومن|ریال|عدد|تا|دانه|قطعه)?(?= )/g, (m, w, n, u) => {
            let v = parseFloat(n); const mult = { میلیون: 1e6, هزار: 1e3, میلیارد: 1e9 }[u] || 1; v *= mult;
            const isQty = (u === 'عدد' || u === 'تا' || u === 'دانه' || u === 'قطعه') || (!u && v < 1000);
            const isMin = /^(بالای|بالاتر|بیشتر|بیش|حداقل)/.test(w);
            if (isQty) { if (isMin) F.minQ = v; else F.maxQ = v; } else { if (isMin) F.minV = v; else F.maxV = v; }
            return ' '.repeat(m.length);
        }).replace(/\s+/g, ' ').trim();

        /* روز هفته به‌عنوان فیلتر */
        q = (' ' + q + ' ').replace(/ (شنبه|یکشنبه|دوشنبه|سهشنبه|چهارشنبه|پنجشنبه|جمعه)(?:ها| ها|هایی)?(?= )/g, (m, w) => { F.wd = ['شنبه', 'یکشنبه', 'دوشنبه', 'سهشنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'].indexOf(w); return ' '; }).replace(/\s+/g, ' ').trim();

        /* کد: «کد ۶۴۴۹» یا خودِ شماره‌ی شناخته‌شده */
        const toks = q.split(' ').filter(Boolean), keep = [];
        const knownCode = (t) => Object.prototype.hasOwnProperty.call(V.codes, t);
        for (let i = 0; i < toks.length; i++) {
            const t = toks[i], nx = toks[i + 1];
            if ((t === 'کد' || t === 'code' || t === 'کدی') && nx && (knownCode(nx) || /^[a-z0-9][\w\-\/]*$/.test(nx))) {
                F.codes.push({ n: nx, raw: V.codes[nx] || nx, known: knownCode(nx) }); i++; continue;
            }
            if (knownCode(t) && (t.length >= 3 || /[a-z]/.test(t)) && !/^(1[34]\d\d)$/.test(t)) { F.codes.push({ n: t, raw: V.codes[t], known: true }); continue; }
            keep.push(t);
        }
        F.codes = F.codes.filter((c, i, a) => a.findIndex(z => z.n === c.n) === i);
        q = keep.join(' ');

        /* پرسنل و بخش (فقط حالت کارفرما) */
        const qt = q.split(' ').filter(Boolean);
        const used = {};
        if (S.emp && V.workers.length) {
            const sc = V.workers.map(w => {
                let s = 0, via = [];
                if (w.n.length >= 3 && (' ' + q + ' ').indexOf(' ' + w.n + ' ') >= 0 && w.toks.length > 1) { s = w.toks.length + 1; w.toks.forEach(t => { const i = qt.indexOf(t); if (i >= 0) via.push(i); }); }
                else w.toks.forEach(t => { qt.forEach((z, i) => { if (z.length >= 2 && nearN(z, t) && LX.stop.indexOf(z) < 0 && !isLexWord(z)) { s++; via.push(i); } }); });
                return { w, s, via };
            }).filter(x => x.s > 0);
            if (sc.length) {
                const mx = Math.max.apply(null, sc.map(x => x.s)), top = sc.filter(x => x.s === mx);
                if (top.length > 1 && mx === 1) { const tk = qt.find(z => top.every(x => x.w.toks.some(t => nearN(z, t)))); P.ambig = { type: 'worker', list: top.map(x => x.w.name), tok: tk || '' }; }
                else { top.forEach(x => { F.workers.push({ n: x.w.n, name: x.w.name }); x.via.forEach(i => used[i] = 1); }); }
            }
        }
        if (S.emp && V.sections.length) {
            const idx = qt.indexOf('بخش');
            V.sections.forEach(s => {
                const hit = s.toks.some(t => qt.some((z, i) => !used[i] && z.length >= 3 && nearN(z, t) && i !== idx));
                if (hit && (' ' + q + ' ').indexOf(' ' + s.n.split(' ')[0]) >= 0) { F.sections.push({ n: s.n, name: s.name }); s.toks.forEach(t => qt.forEach((z, i) => { if (nearN(z, t)) used[i] = 1; })); }
            });
        }
        P.entities = F.codes.length + F.workers.length + F.sections.length;
        P.qualSection = F.sections.length > 0; P.qualWorker = F.workers.length > 0;
        q = qt.filter((z, i) => !used[i]).join(' ');

        /* عدد باقی‌مانده = تعداد نتایج (۵ کد برتر) */
        q = (' ' + q + ' ').replace(/ (\d{1,2}) (?!\d)/, (m, n) => { if (+n >= 1 && +n <= 50) { P.topN = +n; return ' '; } return m; }).replace(/\s+/g, ' ').trim();

        /* واژگان */
        const Q = mkQ(q), P0count = q.split(' ').filter(Boolean).length;
        const fl = P.flags;
        fl.greet = take(Q, 'greet'); fl.thanks = take(Q, 'thanks'); fl.help = take(Q, 'help', true);
        take(Q, 'd_status');
        fl.why = take(Q, 'why'); fl.forecast = take(Q, 'forecast', true); fl.goal = take(Q, 'goal');
        fl.compare = take(Q, 'compare', true); fl.anomaly = take(Q, 'anomaly', true); fl.streak = take(Q, 'streak');
        fl.idle = take(Q, 'idle'); fl.quality = take(Q, 'quality'); fl.tips = take(Q, 'tips', true);
        fl.analysis = take(Q, 'analysis', true); fl.summary = take(Q, 'summary', true);
        fl.last = take(Q, 'last'); fl.first = take(Q, 'first'); fl.list = take(Q, 'list'); fl.find = take(Q, 'find');
        fl.more = P0count <= 3 ? take(Q, 'more') : false; fl.pron = take(Q, 'pron');
        fl.stLate = take(Q, 'st_late'); fl.stEarly = take(Q, 'st_early');
        fl.who = take(Q, 'who');
        fl.active = take(Q, 'active', true);
        const mh = take(Q, 'm_perhour'), mhrs = take(Q, 'm_hours'), mdays = take(Q, 'm_days');
        const mcount = take(Q, 'm_count'), mqty = take(Q, 'm_qty'), minc = take(Q, 'm_income', true);
        const mlate = take(Q, 'm_late', true), mon = take(Q, 'm_ontime', true), mdur = take(Q, 'm_dur'), munit = take(Q, 'm_unit');
        fl.rate = take(Q, 'rate'); fl.avg = take(Q, 'avg', true);
        const dW = take(Q, 'd_weekday'), dHr = take(Q, 'd_hour'), dD = take(Q, 'd_day'), dWk = take(Q, 'd_week'), dMo = take(Q, 'd_month');
        const dC = take(Q, 'd_code'), dWo = take(Q, 'd_worker'), dSe = take(Q, 'd_section'), dCo = take(Q, 'd_color'), dTi = take(Q, 'd_title');
        const smax = take(Q, 'sup_max'), smin = take(Q, 'sup_min');
        fl.busy = has({ W: ' ' + norm(raw).split(' ').map(stem).join(' ') + ' ' }, 'busy');
        fl.late = mlate; fl.ontime = mon;

        if (smin) P.sup = 'min'; else if (smax) P.sup = 'max';
        if (fl.stLate) F.status = 'late'; if (fl.stEarly) F.status = 'early';

        /* بُعد گروه‌بندی */
        P.dim = dW ? 'weekday' : dHr ? 'hour' : dC ? 'code' : dSe ? 'section' : dCo ? 'color' : dTi ? 'title' : dWo ? 'worker' : dWk ? 'week' : dMo ? 'month' : dD ? 'day' : null;
        if (P.dim === 'section' && P.qualSection) P.dim = null;
        if (P.dim === 'worker' && P.qualWorker && !fl.who) P.dim = null;
        if (fl.who && !P.dim) P.dim = S.emp ? 'worker' : 'day';
        /* «ساعت» تنها بدون پرسش/برترین، بُعد نیست */
        if (P.dim === 'hour' && !P.sup && !/(کدام|کدوم|چه ساعتی|ساعات|هر ساعت|پرکار)/.test(norm(raw))) P.dim = null;
        if ((P.dim === 'day' || P.dim === 'week' || P.dim === 'month') && P.range && P.range.kind === 'days' && P.range.from === P.range.to) P.dim = null;

        /* سنجه */
        let m = null;
        if (mh) m = 'perhour'; else if (mhrs) m = 'hours'; else if (mdays) m = 'days';
        else if (mlate) m = fl.rate ? 'latepct' : 'late';
        else if (mon) m = 'ontimepct';
        else if (mdur) m = 'avgdur'; else if (munit) m = 'avgunit';
        else if (mcount) m = 'count'; else if (mqty) m = 'qty'; else if (minc) m = 'income';
        if (fl.avg && m) {
            if (m === 'income') m = (P.dim === 'day') ? 'perday' : 'avgval';
            else if (m === 'count' && P.dim === 'day') m = 'perdayn';
            else if (m === 'qty') m = 'avgqty';
            if ((m === 'perday' || m === 'perdayn') && P.dim === 'day') P.dim = null;
        }
        if (m === 'late' && fl.rate) m = 'latepct';
        P.metric = m; P.metricExplicit = !!m;
        if (m === 'hours' || m === 'days') { /* مستقل از بُعد */ }

        /* واژه‌های باقی‌مانده: عنوان/رنگ */
        const left = Q.W.trim().split(' ').filter(w => w && LX.stop.indexOf(w) < 0 && !/^\d+$/.test(w) && w.length >= 3);
        left.forEach(w => {
            if (V.tok[w]) { F.text.push({ n: w, raw: w }); return; }
            let best = null; Object.keys(V.tok).forEach(k => { if (nearN(w, k) && (!best || V.tok[k] > V.tok[best])) best = k; });
            if (best) F.text.push({ n: best, raw: best }); else P.unknown.push(w);
        });
        F.text = F.text.filter((t, i, a) => a.findIndex(z => z.n === t.n) === i);
        P.tokenCount = norm(raw).split(' ').filter(Boolean).length;
        return P;
    }
    function isLexWord(z) {
        const s = stem(z);
        for (const k in LX) { if (k === 'stop') continue; for (const p of LX[k]) { const c = ph(p); if (c.single && c.single === s) return true; } }
        return false;
    }

    /* ============================ فیلتر و گروه‌بندی ============================ */
    function matchRec(x, F) {
        if (F.codes.length && !F.codes.some(c => c.n === x.code)) return false;
        if (F.workers.length && !F.workers.some(w => w.n === x.wnn)) return false;
        if (F.sections.length && !F.sections.some(s => s.n === x.secn)) return false;
        if (F.status === 'late' && !x.late) return false;
        if (F.status === 'early' && !x.early) return false;
        if (F.status === 'ontime' && !(x.judged && !x.late)) return false;
        if (F.wd !== null && x.wd !== F.wd) return false;
        if (F.text.length && !F.text.every(t => x.hay.indexOf(t.n) >= 0)) return false;
        if (F.minV !== null && !(x.inc !== null && x.inc >= F.minV)) return false;
        if (F.maxV !== null && !(x.inc !== null && x.inc <= F.maxV)) return false;
        if (F.minQ !== null && !(x.qty >= F.minQ)) return false;
        if (F.maxQ !== null && !(x.qty <= F.maxQ)) return false;
        return true;
    }
    const gather = (S, P, rg) => S.recs.filter(x => inR(x, rg) && matchRec(x, P.filters));
    function fLabel(P) {
        const F = P.filters, a = [];
        F.codes.forEach(c => a.push('کد ' + fa(c.raw))); F.workers.forEach(w => a.push(w.name)); F.sections.forEach(s => a.push('بخش ' + s.name));
        if (F.status) a.push({ late: 'تاخیردار', early: 'زودتر از موعد', ontime: 'به‌موقع' }[F.status]);
        if (F.wd !== null) a.push('روزهای ' + WD[F.wd]); if (F.text.length) a.push('«' + F.text.map(t => t.raw).join(' ') + '»');
        if (F.minV !== null) a.push('ارزش ≥ ' + f(F.minV)); if (F.maxV !== null) a.push('ارزش ≤ ' + f(F.maxV));
        if (F.minQ !== null) a.push('تعداد ≥ ' + f(F.minQ)); if (F.maxQ !== null) a.push('تعداد ≤ ' + f(F.maxQ));
        return a.join(' · ');
    }
    const hasFilter = (P) => !!fLabel(P);

    function dimDef(d, S) {
        const D = {
            day: { key: x => x.jdn || null, name: k => dayShort(S, k), chrono: true, order: (a, b) => a - b },
            weekday: { key: x => x.wd >= 0 ? x.wd : null, name: k => WD[k], chrono: true, order: (a, b) => a - b },
            hour: { key: x => x.hour >= 0 ? x.hour : null, name: k => fa(k) + ':۰۰ تا ' + fa(k + 1) + ':۰۰', chrono: true, order: (a, b) => a - b },
            week: { key: x => x.jdn ? x.jdn - S.wdOf(x.jdn) : null, name: k => 'هفته‌ی ' + dateStr(k).split('/').slice(1).join('/'), chrono: true, order: (a, b) => a - b },
            month: { key: x => x.mk, name: k => mkLabel(k), chrono: true, order: (a, b) => mkOrd(a) - mkOrd(b) },
            code: { key: x => x.code || null, name: (k, l) => 'کد ' + fa(l[0].codeRaw) + (l[0].title ? ' — ' + l[0].title : '') },
            worker: { key: x => x.wnn || null, name: (k, l) => l[0].wn },
            section: { key: x => x.secn || null, name: (k, l) => l[0].sec },
            color: { key: x => norm(x.color) || null, name: (k, l) => l[0].color },
            title: { key: x => norm(x.title) || null, name: (k, l) => l[0].title }
        };
        return D[d];
    }
    function groupBy(list, d, S) {
        const D = dimDef(d, S), g = new Map();
        list.forEach(x => { const k = D.key(x); if (k === null || k === undefined) return; if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
        const rows = []; g.forEach((l, k) => rows.push({ k, name: D.name(k, l), list: l, a: agg(l) }));
        return { rows, D };
    }
    const DIM_LABEL = { day: 'روز', weekday: 'روز هفته', hour: 'ساعت', week: 'هفته', month: 'ماه', code: 'کد', worker: 'پرسنل', section: 'بخش', color: 'رنگ', title: 'مدل' };

    /* ============================ بلوک‌های پاسخ ============================ */
    const B = {
        h: (t) => ({ k: 'h', t }), p: (t) => ({ k: 'p', t }), note: (t, tone) => ({ k: 'note', t, tone }),
        big: (label, value, sub, tone) => ({ k: 'big', label, value, sub, tone }),
        kv: (rows) => ({ k: 'kv', rows }), bars: (rows) => ({ k: 'bars', rows }),
        table: (head, rows) => ({ k: 'table', head, rows }), list: (items) => ({ k: 'list', items }),
        spark: (vals, labels, hi) => ({ k: 'spark', vals, labels, hi }), prog: (label, pct, right, tone) => ({ k: 'prog', label, pct, right, tone }),
        finds: (items) => ({ k: 'finds', items })
    };
    function delta(c, p, up) {
        if (c === null || p === null || p === undefined) return null;
        if (p === 0) return { t: c === 0 ? 'بدون تغییر نسبت به دوره‌ی قبل' : 'دوره‌ی قبل صفر بوده است', tone: 'info', d: null };
        const d = (c - p) / Math.abs(p) * 100, upD = d >= 0, tone = Math.abs(d) < 1 ? 'info' : (upD === (up !== false) ? 'good' : 'warn');
        return { t: (upD ? '▲ ' : '▼ ') + f(Math.abs(d)) + '٪ ' + (upD ? 'بیشتر' : 'کمتر') + ' از دوره‌ی قبل', tone, d };
    }
    const dlt = (key, a, b) => delta(mval(key, a), b ? mval(key, b) : null, METRIC[key].up);
    function barsFor(rows, key, S, max) {
        const vals = rows.map(r => mval(key, r.a)).filter(v => v !== null), mx = Math.max.apply(null, vals.concat([1]));
        return B.bars(rows.slice(0, max || 12).map(r => { const v = mval(key, r.a); return { l: r.name, t: v === null ? '—' : METRIC[key].fmt(v), w: v === null ? 0 : Math.max(2, v / mx * 100), hi: r.hi }; }));
    }
    function toPlain(blocks) {
        return blocks.map(b => {
            switch (b.k) {
                case 'h': case 'p': case 'note': return b.t.replace(/\*\*/g, '');
                case 'big': return b.label + ': ' + b.value + (b.sub ? ' (' + b.sub + ')' : '');
                case 'kv': return b.rows.map(r => r[0] + ': ' + r[1]).join('\n');
                case 'bars': return b.rows.map(r => '• ' + r.l + ': ' + r.t).join('\n');
                case 'table': return [b.head.join(' | ')].concat(b.rows.map(r => r.map(c => (c && c.t !== undefined) ? c.t : c).join(' | '))).join('\n');
                case 'list': return b.items.map(i => '• ' + i).join('\n');
                case 'btns': return `<div class="flex flex-wrap gap-2 mt-1 mb-1.5">${b.items.map(it => { const ac = CMD.acts[it.id], dead = !ac || ac.used, c = it.tone === 'ok' ? 'bg-indigo-600 text-white border-indigo-600' : it.tone === 'bad' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'; return `<button type="button" ${dead ? 'disabled' : `onclick="aiCmdBtn('${it.id}')"`} class="tactile-btn px-3 py-1.5 rounded-xl border text-[11.5px] font-bold ${c}${dead ? ' opacity-40' : ''}">${esc(it.t)}</button>`; }).join('')}</div>`;
            case 'finds': return b.items.map(i => '• ' + i.x).join('\n');
                case 'prog': return b.label + ': ' + (b.right || f(b.pct) + '٪');
                default: return '';
            }
        }).filter(Boolean).join('\n').replace(/\*\*/g, '');
    }

    /* ============================ پیش‌بینی و آمار ============================ */
    function dailyIncome(S, fromJ, toJ, list) {
        const m = new Map();
        (list || S.recs).forEach(x => { if (x.jdn >= fromJ && x.jdn <= toJ) { const a = m.get(x.jdn) || { inc: 0, n: 0 }; a.inc += x.inc || 0; a.n++; m.set(x.jdn, a); } });
        return m;
    }
    function expectation(S, list) {
        const src = list || S.recs; let first = 0;
        src.forEach(x => { if (x.jdn && (!first || x.jdn < first)) first = x.jdn; });
        const from = Math.max(S.T - 56, first || S.T), to = S.T - 1;
        const dm = dailyIncome(S, from, to, src), by = [[], [], [], [], [], [], []], all = [];
        for (let j = from; j <= to; j++) { const v = dm.get(j) ? dm.get(j).inc : 0; by[S.wdOf(j)].push(v); all.push(v); }
        const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
        const mAll = mean(all), sd = all.length > 1 ? Math.sqrt(mean(all.map(v => (v - mAll) * (v - mAll)))) : 0;
        const E = by.map(a => a.length >= 2 ? mean(a) : mAll);
        return { E, sd, mAll, nDays: all.length, workMean: mean(all.filter(v => v > 0)) };
    }
    function project(S, endJ, soFar, list) {
        const ex = expectation(S, list), todayInc = sum((list || S.recs).filter(x => x.jdn === S.T), x => x.inc || 0);
        let rem = Math.max(0, ex.E[S.wdOf(S.T)] - todayInc), cnt = 0;
        for (let j = S.T + 1; j <= endJ; j++) { rem += ex.E[S.wdOf(j)]; if (ex.E[S.wdOf(j)] > 0) cnt++; }
        const proj = soFar + rem, spread = ex.sd * Math.sqrt(Math.max(1, cnt)) * 0.7;
        return { proj, low: Math.max(soFar, proj - spread), high: proj + spread, ex, workLeft: cnt + (ex.E[S.wdOf(S.T)] > 0 ? 1 : 0), conf: ex.nDays >= 21 ? 'خوب' : ex.nDays >= 10 ? 'متوسط' : 'کم' };
    }
    function streaks(S) {
        const days = {}; S.recs.forEach(x => { if (x.jdn) days[x.jdn] = 1; });
        const keys = Object.keys(days).map(Number).sort((a, b) => a - b);
        if (!keys.length) return { cur: 0, best: 0, bestEnd: 0 };
        let best = 0, bestEnd = 0, run = 0, prev = 0;
        keys.forEach(j => {
            const gap = prev ? j - prev : 1, fri = prev && gap === 2 && S.wdOf(prev + 1) === 6;
            run = (!prev || gap === 1 || fri) ? run + 1 : 1; if (run > best) { best = run; bestEnd = j; } prev = j;
        });
        let cur2 = 0, j = S.T; if (!days[j]) j--;
        if (S.wdOf(j) === 6 && !days[j]) j--;
        while (true) { if (days[j]) { cur2++; j--; } else if (S.wdOf(j) === 6 && days[j - 1]) { j--; } else break; }
        return { cur: cur2, best, bestEnd };
    }
    function idleDays(S, from, to) {
        const has2 = {}; S.recs.forEach(x => { if (x.jdn) has2[x.jdn] = 1; });
        const out = []; for (let j = from; j <= to; j++) if (!has2[j] && S.wdOf(j) !== 6) out.push(j);
        return out;
    }
    function anomalies(S) {
        const out = [], from = S.T - 45, dm = dailyIncome(S, from, S.T), vals = [];
        dm.forEach((v, j) => { if (j < S.T) vals.push(v.inc); });
        if (vals.length >= 7) {
            const mu = vals.reduce((a, b) => a + b, 0) / vals.length, sd = Math.sqrt(vals.reduce((a, b) => a + (b - mu) * (b - mu), 0) / vals.length);
            if (sd > 0) dm.forEach((v, j) => { if (j >= S.T) return; const z = (v.inc - mu) / sd; if (Math.abs(z) >= 1.8) out.push({ t: z > 0 ? 'good' : 'warn', x: `${dayLong(S, j)}: ${money(v.inc)} — ${z > 0 ? 'خیلی بالاتر' : 'خیلی پایین‌تر'} از روز معمولی (میانگین ${money(mu)})`, j }); });
        }
        /* قیمت واحد یا تعداد پرت در هر کد */
        const byCode = new Map(); S.recs.forEach(x => { if (x.code) { if (!byCode.has(x.code)) byCode.set(x.code, []); byCode.get(x.code).push(x); } });
        const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
        byCode.forEach(l => {
            if (l.length < 4) return;
            const mu = med(l.filter(x => x.unit > 0).map(x => x.unit)), mq = med(l.map(x => x.qty));
            l.forEach(x => {
                if (mu && x.unit > 0 && Math.abs(x.unit - mu) / mu > 0.3 && x.jdn >= S.T - 45) out.push({ t: 'warn', x: `قیمت واحد کد ${fa(x.codeRaw)} در ${x.r.date} برابر ${money(x.unit)} است؛ معمولاً حدود ${money(mu)}`, j: x.jdn });
                if (mq > 0 && x.qty > mq * 3 && x.qty - mq > 20 && x.jdn >= S.T - 45) out.push({ t: 'warn', x: `تعداد کد ${fa(x.codeRaw)} در ${x.r.date} برابر ${f(x.qty)} عدد ثبت شده؛ معمولاً حدود ${f(mq)} (شاید اشتباه تایپی)`, j: x.jdn });
            });
        });
        return out.sort((a, b) => b.j - a.j);
    }

    /* ============================ یافته‌های تحلیلی ============================ */
    function findings(S) {
        const out = [], c = cur(), lab = S.emp ? 'ارزش کار' : 'درآمد';
        const m = agg(S.m), prevSame = agg(S.p.filter(x => x.dom <= S.day));
        if (!S.m.length) { out.push({ i: 'fa-circle-info', t: 'info', x: `در ${S.jc.monthName} هنوز کارکردی ثبت نشده است. بعد از ثبت اولین رکورد، تحلیل اینجا ظاهر می‌شود.` }); return out; }
        if (S.act && S.prog) {
            const rm = S.prog.remainingMinutes, name = S.act.itemTitle || S.act.itemCode || 'کار جاری';
            out.push(rm < 0 ? { i: 'fa-triangle-exclamation', t: 'warn', x: `«${name}» از موعد گذشته و هنوز تمام نشده است.` }
                : { i: 'fa-stopwatch', t: S.prog.percent >= 85 ? 'warn' : 'info', x: `«${name}» ${f(Math.min(S.prog.percent, 999))}٪ پیش رفته و حدود ${f(rm / 60)} ساعت تا موعد مانده است.` });
        }
        const today = agg(S.recs.filter(x => x.jdn === S.T));
        out.push({ i: 'fa-sun', t: today.n ? 'good' : 'info', x: today.n ? `امروز ${f(today.n)} کارکرد (${f(today.inc)} ${c}) ثبت شده است.` : 'امروز هنوز کارکردی ثبت نشده است.' });
        out.push({ i: 'fa-coins', t: 'info', x: `تا امروز ${f(m.inc)} ${c} از ${f(m.n)} کارکرد (${f(m.qty)} عدد) ثبت شده است.` });
        if (S.day >= 3 && m.inc > 0) {
            const pr = project(S, S.mEnd, m.inc, S.recs);
            let cmp = ''; const pm = agg(S.p).inc;
            if (pm > 0) { const d = Math.round((pr.proj - pm) / pm * 100); cmp = d >= 0 ? `؛ حدود ${f(d)}٪ بیشتر از ماه قبل` : `؛ حدود ${f(-d)}٪ کمتر از ماه قبل`; }
            out.push({ i: 'fa-chart-line', t: 'info', x: `با الگوی روزهای هفته، پایان ماه حدود ${f(pr.proj)} ${c} می‌شود${cmp}.` });
        }
        if (S.goal > 0) {
            const left = S.goal - m.inc, dl = Math.max(1, S.dim - S.day + 1);
            out.push(left <= 0 ? { i: 'fa-trophy', t: 'good', x: 'هدف درآمد ماهانه محقق شد. آفرین!' } : { i: 'fa-bullseye', t: 'info', x: `برای هدف ماهانه، روزی حدود ${f(left / dl)} ${c} لازم است (${f(left)} ${c} باقی مانده).` });
        }
        if (S.m.length >= 3) out.push(m.late ? { i: 'fa-clock', t: 'warn', x: `${f(m.late)} از ${f(m.judged || m.n)} کارکرد (${f(m.late / (m.judged || m.n) * 100)}٪) با تاخیر تحویل شده است.` } : { i: 'fa-circle-check', t: 'good', x: 'همه‌ی کارهای این ماه به موقع تحویل شده‌اند.' });
        /* روند ۷ روز اخیر در برابر ۷ روز قبل از آن */
        const w1 = sum(S.recs.filter(x => x.jdn > S.T - 7 && x.jdn <= S.T), x => x.inc || 0), w0 = sum(S.recs.filter(x => x.jdn > S.T - 14 && x.jdn <= S.T - 7), x => x.inc || 0);
        if (w0 > 0 && w1 > 0) { const d = Math.round((w1 - w0) / w0 * 100); if (Math.abs(d) >= 10) out.push({ i: d > 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down', t: d > 0 ? 'good' : 'warn', x: `${lab} ۷ روز اخیر ${f(Math.abs(d))}٪ ${d > 0 ? 'بیشتر' : 'کمتر'} از هفته‌ی قبل از آن بوده است.` }); }
        const st = streaks(S); if (st.cur >= 5) out.push({ i: 'fa-fire', t: 'good', x: `${f(st.cur)} روز کاری پشت سر هم کارکرد ثبت کرده‌اید.` });
        /* تمرکز روی یک کد */
        const g = groupBy(S.m, 'code', S);
        if (g.rows.length >= 3 && m.inc > 0) { const top = g.rows.slice().sort((a, b) => b.a.inc - a.a.inc)[0], sh = top.a.inc / m.inc * 100; if (sh >= 55) out.push({ i: 'fa-chart-pie', t: 'info', x: `${f(sh)}٪ ${lab} این ماه فقط از کد ${fa(top.list[0].codeRaw)} آمده است.` }); }
        if (S.emp === false && S.m.length >= 8) { const wd = [0, 0, 0, 0, 0, 0, 0]; S.recs.forEach(x => { if (x.wd >= 0) wd[x.wd]++; }); if (Math.max.apply(null, wd) > 0) out.push({ i: 'fa-calendar-week', t: 'info', x: `پرکارترین روز هفته‌ی شما «${WD[wd.indexOf(Math.max.apply(null, wd))]}» است.` }); }
        const unk = S.m.filter(x => x.inc === null).length; if (unk) out.push({ i: 'fa-circle-question', t: 'warn', x: `${f(unk)} کارکرد قیمت ندارد؛ ${lab} واقعی بیشتر از عدد بالاست.` });
        return out;
    }
    const insights = (S) => findings(S).slice(0, 7);


    /* ============================ پاسخ‌دهنده‌ها ============================ */
    const R = (blocks, chips) => ({ blocks, chips: (chips || []).filter(Boolean).slice(0, 4) });
    const rangeLbl = (rg, dflt) => rg ? rg.label : dflt;
    const lab = (S) => S.emp ? 'ارزش کار' : 'درآمد';
    const recLine = (x) => `• کد ${fa(x.codeRaw || '-')} — ${x.title || ''}${x.color ? ' ' + x.color : ''} (${x.r.date || ''}${x.r.time ? ' ' + x.r.time : ''})`;
    const recLine2 = (S, x) => `${recLine(x)}${x.wn ? ' · ' + x.wn : ''} · ${f(x.qty)} عدد${x.inc !== null ? ' · ' + money(x.inc) : ''}${x.late ? ' · تاخیر' : ''}`;
    const defaultRange = (S, P, kind) => {
        if (P.range) return P.range;
        if (kind === 'all') return RG.all();
        return RG.months([S.curKey], 'این ماه (' + mkLabel(S.curKey) + ')');
    };
    const emptyAns = (S, P, rg) => R([B.p('در «' + rg.label + '»' + (hasFilter(P) ? ' برای (' + fLabel(P) + ')' : '') + ' کارکردی پیدا نشد.'),
        B.note(lastDataHint(S, P), 'info')], hasFilter(P) ? ['همین را برای کل دوره'] : ['این هفته', 'ماه قبل', 'راهنما']);
    function lastDataHint(S, P) {
        const l = S.recs.filter(x => matchRec(x, P.filters)).sort((a, b) => b.jdn - a.jdn)[0];
        return l ? 'آخرین ثبت مرتبط: ' + l.r.date + ' (' + (l.title || 'کد ' + fa(l.codeRaw)) + ').' : 'هنوز هیچ ثبتی با این مشخصات وجود ندارد.';
    }
    function flagNeedEmployer(S, what) { return R([B.p(what + ' فقط در حالت کارفرما در دسترس است. در حالت پرسنل فقط کارکردهای خودتان تحلیل می‌شود.')], ['خلاصه‌ی این ماه', 'راهنما']); }

    /* ---------- نمای کلی / پروفایل (کد، پرسنل، بخش، عنوان، بازه) ---------- */
    function aOverview(S, P) {
        const F = P.filters, entityOnly = !!(F.codes.length || F.workers.length || F.sections.length || F.text.length);
        const rg = P.range || (entityOnly && !F.workers.length && !F.sections.length ? RG.all() : defaultRange(S, P));
        const list = gather(S, P, rg), a = agg(list), L = fLabel(P);
        if (F.codes.length === 1 && !F.codes[0].known) {
            const sim = Object.keys(vocab(S).codes).filter(k => near(k, F.codes[0].n) || k.indexOf(F.codes[0].n) === 0).slice(0, 3);
            return R([B.p(`کدی با شماره‌ی «${fa(F.codes[0].raw)}» پیدا نشد.`), sim.length ? B.note('شاید منظورتان یکی از این کدها بود:', 'info') : B.note('شماره را دوباره بررسی کنید.', 'info')], sim.map(k => 'کد ' + k));
        }
        if (!list.length) return emptyAns(S, P, rg);
        const title = (L || 'همه‌ی کارکردها') + ' — ' + rg.label;
        const blocks = [B.big(title, METRIC.income.fmt(a.inc), `${f(a.n)} کارکرد · ${f(a.qty)} عدد`, 'info')];
        const rows = [];
        if (a.n && a.priced) rows.push(['میانگین ارزش هر کارکرد', money(a.inc / a.priced)]);
        if (a.n) rows.push(['میانگین تعداد هر کارکرد', f(a.qty / a.n) + ' عدد']);
        if (a.unitN) { const us = list.filter(x => x.unit > 0).map(x => x.unit), mn = Math.min.apply(null, us), mx = Math.max.apply(null, us); rows.push(['قیمت واحد', mn === mx ? money(mn) : `${money(mn)} تا ${money(mx)} (میانگین ${money(a.unitSum / a.unitN)})`]); }
        if (a.durN) rows.push(['میانگین مدت انجام', formatMinutesDuration(a.durSum / a.durN)]);
        if (a.hDur > 0) rows.push(['بازده ساعتی', money(a.hInc / (a.hDur / 60)) + ' در ساعت']);
        if (a.judged) rows.push(['نرخ تحویل به‌موقع', pctS((a.judged - a.late) / a.judged * 100) + (a.late ? ` (${f(a.late)} تاخیر)` : ' — بدون تاخیر')]);
        if (a.days > 1) rows.push(['روزهای دارای ثبت', f(a.days)]);
        blocks.push(B.kv(rows));
        /* مقایسه با دوره‌ی قبل */
        const pr = prevOf(rg, S);
        if (pr) { const pa = agg(gather(S, P, pr)); const d = dlt('income', a, pa); if (d && pa.n) blocks.push(B.note(`${d.t} (${pr.label}: ${money(pa.inc)})`, d.tone)); }
        /* سهم از کل و رتبه */
        if (F.codes.length === 1 || F.workers.length === 1 || F.sections.length === 1 || F.text.length) {
            const tot = agg(S.recs.filter(x => inR(x, rg))); if (tot.inc > 0 && a.inc > 0) blocks.push(B.note(`سهم از کل ${lab(S)} در این بازه: ${pctS(a.inc / tot.inc * 100)}`, 'info'));
        }
        if (F.codes.length === 1) {
            const g = groupBy(S.recs.filter(x => inR(x, rg)), 'code', S).rows.sort((x, y) => y.a.inc - x.a.inc), rk = g.findIndex(r => r.k === F.codes[0].n) + 1;
            if (rk) blocks.push(B.note(`رتبه‌ی ${f(rk)} از ${f(g.length)} کد از نظر ${lab(S)}.`, 'info'));
            if (S.emp) { const w = groupBy(list, 'worker', S).rows.sort((x, y) => y.a.n - x.a.n).slice(0, 3); if (w.length) blocks.push(B.note('بیشتر انجام‌دهنده‌ها: ' + w.map(r => `${r.name} (${f(r.a.n)})`).join('، '), 'info')); }
        }
        if (F.workers.length === 1 && typeof mgrWorkerState === 'function') {
            const w = S.workers.find(z => norm(z.name) === F.workers[0].n);
            if (w) { try { const st = mgrWorkerState(w); if (st.rec) blocks.push(B.note(`کار جاری: ${st.rec.itemTitle || 'کد ' + fa(st.rec.itemCode)} — ${f(Math.min(st.pct, 999))}٪ پیش رفته${st.p && st.p.remainingMinutes < 0 ? ' (از موعد گذشته)' : ''}`, st.key === 'late' ? 'warn' : 'info')); else blocks.push(B.note('الان کار جاری‌ای ندارد.', 'info')); } catch (e) { /* ندارد */ } }
            const team = agg(S.recs.filter(x => inR(x, rg) && x.wnn)), nW = groupBy(S.recs.filter(x => inR(x, rg) && x.wnn), 'worker', S).rows.length;
            if (nW > 1 && team.inc > 0) { const avgTeam = team.inc / nW, d = Math.round((a.inc - avgTeam) / avgTeam * 100); blocks.push(B.note(`${lab(S)} او ${f(Math.abs(d))}٪ ${d >= 0 ? 'بیشتر' : 'کمتر'} از میانگین پرسنل است.`, d >= 0 ? 'good' : 'warn')); }
        }
        if (F.sections.length === 1) { const w = groupBy(list, 'worker', S).rows.sort((x, y) => y.a.inc - x.a.inc).slice(0, 4); if (w.length) blocks.push(barsFor(w, 'income', S)); }
        if (rg.kind !== 'days' || rg.to > rg.from) {
            const dd = groupBy(list, 'day', S).rows.sort((x, y) => x.k - y.k);
            if (dd.length >= 4) blocks.push(B.spark(dd.map(r => r.a.inc), dd.map(r => r.name), dd.reduce((i, r, j, z) => r.a.inc > z[i].a.inc ? j : i, 0)));
        }
        const ex = list.slice().sort((x, y) => (y.jdn * 1440 + (parseTimeToMinutes(y.r.time) || 0)) - (x.jdn * 1440 + (parseTimeToMinutes(x.r.time) || 0))).slice(0, 4);
        blocks.push(B.h('آخرین ثبت‌ها'), B.list(ex.map(x => recLine2(S, x).slice(2))));
        const chips = [];
        if (!P.dim) { if (F.codes.length || F.text.length) chips.push('چه کسی بیشتر انجام داده؟'); chips.push('به تفکیک روز'); }
        chips.push('مقایسه با دوره‌ی قبل'); if (F.codes.length || F.workers.length) chips.push('چرا؟');
        return R(blocks, chips);
    }

    /* ---------- تجمیع، رتبه‌بندی و سنجه‌ها ---------- */
    function aAgg(S, P) {
        const dflt = (P.dim === 'hour' || P.dim === 'weekday' || P.flags.busy) ? 'count' : 'income';
        if ((P.dim === 'worker' || P.dim === 'section') && !S.emp) return flagNeedEmployer(S, 'گزارش بر اساس پرسنل/بخش');
        let key = P.metric || dflt;
        const kindAll = (P.dim === 'hour' || P.dim === 'weekday') && !P.range;
        let rg = P.range || (kindAll ? RG.all() : defaultRange(S, P));
        if (P.dim === 'month' && !P.range) rg = RG.months(Array.from({ length: 6 }, (_, i) => mkAdd(S.curKey, -5 + i)), '۶ ماه اخیر');
        if (P.dim === 'day' && rg.kind === 'days' && rg.to - rg.from > 45) { P.dim = 'week'; }
        const list = gather(S, P, rg), L = fLabel(P);
        if (!list.length) return emptyAns(S, P, rg);
        const M = METRIC[key], mlabel = M.l(S), head = mlabel + (L ? ' — ' + L : '') + ' — ' + rg.label;
        /* بدون بُعد: پاسخ یک‌عددی */
        if (!P.dim) {
            const a = agg(list), v = mval(key, a);
            if (v === null) return R([B.p(`برای محاسبه‌ی «${mlabel}» داده‌ی کافی وجود ندارد` + (key === 'avgdur' || key === 'perhour' || key === 'hours' ? ' (مدت انجام کارها ثبت نشده است).' : '.'))], ['خلاصه‌ی این ماه', 'راهنما']);
            const pr = prevOf(rg, S), pa = pr ? agg(gather(S, P, pr)) : null, d = pa && pa.n ? dlt(key, a, pa) : null;
            const blocks = [B.big(head, M.fmt(v), key === 'income' ? `${f(a.n)} کارکرد · ${f(a.qty)} عدد` : (key === 'count' ? `ارزش: ${money(a.inc)}` : ''), d ? d.tone : 'info')];
            if (d) blocks.push(B.note(`${d.t} (${pr.label}: ${M.fmt(mval(key, pa))})`, d.tone));
            if (key === 'income' && a.priced < a.n) blocks.push(B.note(`${f(a.n - a.priced)} کارکرد قیمت ندارد و در این عدد نیامده است.`, 'warn'));
            if (key === 'income' && rg.kind === 'months' && rg.keys.length === 1 && rg.keys[0] === S.curKey && !hasFilter(P) && S.day >= 3) { const pj = project(S, S.mEnd, a.inc, S.recs); blocks.push(B.note(`پیش‌بینی پایان ماه: حدود ${money(pj.proj)}`, 'info')); }
            if (key === 'latepct' || key === 'late' || key === 'ontimepct') { const lt = list.filter(x => x.late).sort((x, y) => y.jdn - x.jdn).slice(0, 4); if (lt.length) blocks.push(B.h('نمونه‌های تاخیر'), B.list(lt.map(x => recLine2(S, x).slice(2)))); }
            if ((key === 'count' || key === 'qty') && a.n <= 8) blocks.push(B.list(list.slice().sort((x, y) => y.jdn - x.jdn).map(x => recLine2(S, x).slice(2))));
            const chips = ['به تفکیک روز', 'مقایسه با دوره‌ی قبل'];
            if (d && d.d !== null && Math.abs(d.d) >= 5) chips.push('چرا؟');
            if (!hasFilter(P)) chips.push('برترین کدها');
            return R(blocks, chips.filter(c => !(P.dim && c.indexOf('تفکیک') >= 0)));
        }
        /* با بُعد: جدول/نمودار میله‌ای */
        const { rows, D } = groupBy(list, P.dim, S);
        if (!rows.length) return emptyAns(S, P, rg);
        const rateMetric = !!M.rate; let use = rows;
        if (rateMetric) { const ok = rows.filter(r => r.a.judged >= 2); use = ok.length ? ok : rows; }
        use = use.filter(r => mval(key, r.a) !== null);
        if (!use.length) return R([B.p(`برای «${mlabel}» به تفکیک ${DIM_LABEL[P.dim]} داده‌ی کافی نیست.`)], ['خلاصه‌ی این ماه']);
        const asc = P.sup === 'min';
        const byMetric = (x, y) => asc ? mval(key, x.a) - mval(key, y.a) : mval(key, y.a) - mval(key, x.a);
        const chrono = D.chrono && !P.sup;
        const sorted = chrono ? use.slice().sort((x, y) => D.order(x.k, y.k)) : use.slice().sort(byMetric);
        const top = use.slice().sort(byMetric)[0];
        const limit = P.topN || (chrono ? (P.dim === 'day' ? 31 : 14) : 8);
        const shown = sorted.slice(0, limit);
        if (chrono && shown.length) { const mx = shown.reduce((m, r) => Math.max(m, mval(key, r.a)), -Infinity); shown.forEach(r => { if (mval(key, r.a) === mx) r.hi = true; }); }
        const blocks = [B.h(head)];
        const superWord = P.sup ? (asc ? 'کمترین' : 'بیشترین') : 'بالاترین';
        if (P.sup || P.flags.who || use.length > 1) {
            const tot = M.rate || key === 'avgval' || key === 'avgqty' || key === 'avgdur' || key === 'avgunit' || key === 'perhour' || key === 'perday' || key === 'perdayn' ? null : sum(use, r => mval(key, r.a));
            blocks.push(B.p(`**${superWord} ${mlabel}:** ${top.name} با ${M.fmt(mval(key, top.a))}${tot && tot > 0 && use.length > 1 ? ` (${pctS(mval(key, top.a) / tot * 100)} از کل)` : ''}`));
        }
        if (chrono && shown.length >= 5 && key !== 'avgdur') blocks.push(B.spark(shown.map(r => mval(key, r.a)), shown.map(r => r.name), shown.findIndex(r => r.hi)));
        if (shown.length > 1 || !chrono) blocks.push(barsFor(shown, key, S, limit));
        if (rateMetric && rows.length > use.length) blocks.push(B.note('فقط گروه‌هایی با حداقل ۲ نمونه‌ی قابل‌قضاوت نمایش داده شد.', 'info'));
        if (!chrono && sorted.length > limit) blocks.push(B.note(`${f(sorted.length - limit)} مورد دیگر هم هست؛ «بیشتر» را بزنید.`, 'info'));
        const chips = [];
        if (chrono) chips.push(P.dim === 'day' ? 'کدام روز بهترین بود؟' : null);
        if (!hasFilter(P) && P.dim !== 'code') chips.push('به تفکیک کد');
        if (P.dim !== 'worker' && S.emp) chips.push('به تفکیک پرسنل');
        chips.push('مقایسه با دوره‌ی قبل'); if (!chrono) chips.push('بیشتر');
        return R(blocks, chips);
    }

    /* جدول چندستونه برای «پرسنل»، «کدها» و … (بدون سنجه‌ی مشخص) */
    function aTable(S, P) {
        if ((P.dim === 'worker' || P.dim === 'section') && !S.emp) return flagNeedEmployer(S, 'گزارش پرسنل و بخش‌ها');
        const rg = P.range || defaultRange(S, P), list = gather(S, P, rg);
        if (!list.length) return emptyAns(S, P, rg);
        const { rows } = groupBy(list, P.dim, S), asc = P.sup === 'min';
        const key = P.flags.busy ? 'count' : 'income';
        const sorted = rows.slice().sort((x, y) => asc ? mval(key, x.a) - mval(key, y.a) : mval(key, y.a) - mval(key, x.a));
        const limit = P.topN || 8, shown = sorted.slice(0, limit), L = fLabel(P);
        const head = DIM_LABEL[P.dim] + ' — ' + rg.label + (L ? ' — ' + L : '');
        const rowsT = shown.map(r => { const ot = r.a.judged ? (r.a.judged - r.a.late) / r.a.judged * 100 : null; return [r.name, f(r.a.n), f(r.a.qty), money(r.a.inc), r.a.late ? { t: f(r.a.late), tone: 'warn' } : '—', ot === null ? '—' : pctS(ot)]; });
        const blocks = [B.h(head), B.table([DIM_LABEL[P.dim], 'کارکرد', 'تعداد', lab(S), 'تاخیر', 'به‌موقع'], rowsT)];
        if (sorted.length > limit) blocks.push(B.note(`${f(sorted.length - limit)} مورد دیگر هم هست.`, 'info'));
        if (P.dim === 'code' && S.recs.some(x => x.dur !== null)) { const ph2 = sorted.filter(r => r.a.hDur > 0 && r.a.n >= 2).sort((x, y) => mval('perhour', y.a) - mval('perhour', x.a)); if (ph2.length >= 2) blocks.push(B.note(`از نظر بازده ساعتی، کد ${fa(ph2[0].list[0].codeRaw)} با ${money(mval('perhour', ph2[0].a))} در ساعت پیشتاز است.`, 'good')); }
        const chips = ['مقایسه با دوره‌ی قبل']; if (P.dim === 'code') chips.push('کدام کد بازده ساعتی بهتری دارد؟', 'کدام کد بیشترین تاخیر را دارد؟'); else chips.push('بیشترین تاخیر', 'چرا؟');
        return R(blocks, chips);
    }

    /* ---------- مقایسه ---------- */
    function aCompare(S, P, ctxP) {
        const F = P.filters; let A, Bg, la, lb, PA = P, PB = P, tp = 'range';
        if (F.workers.length >= 2 || F.codes.length >= 2) {
            tp = 'entity'; const ents = F.workers.length >= 2 ? F.workers : F.codes, isW = F.workers.length >= 2;
            const mk = (e) => { const p2 = { filters: newFilters() }; if (isW) p2.filters.workers = [e]; else p2.filters.codes = [e]; return p2; };
            PA = mk(ents[0]); PB = mk(ents[1]); la = isW ? ents[0].name : 'کد ' + fa(ents[0].raw); lb = isW ? ents[1].name : 'کد ' + fa(ents[1].raw);
            const rg = P.range || defaultRange(S, P, 'month'); A = agg(gather(S, PA, rg)); Bg = agg(gather(S, PB, rg)); P.range = rg;
        } else {
            let r1 = P.ranges[0], r2 = P.ranges[1];
            /* «مقایسه با ماه قبل» یعنی بازه‌ی جاری در برابر آن بازه */
            if (r1 && !r2 && /(^| )(با|نسبت به|در برابر|در مقابل) /.test(norm(P.raw))) {
                r2 = r1;
                r1 = (r2.kind === 'days' && r2.to - r2.from === 6) ? RG.days(S.ws, S.T, 'این هفته') : (r2.kind === 'days' && r2.from === r2.to) ? RG.days(S.T, S.T, 'امروز') : (r2.kind === 'year' ? RG.year(S.jy, 'امسال') : RG.months([S.curKey], 'این ماه (' + mkLabel(S.curKey) + ')'));
            }
            if (!r1 && ctxP && ctxP.range) r1 = ctxP.range;
            if (!r1) r1 = RG.months([S.curKey], 'این ماه');
            if (!r2) r2 = prevOf(r1, S);
            if (!r2) return R([B.p('برای مقایسه یک بازه‌ی دیگر هم بگویید؛ مثلاً «مقایسه مهر با شهریور».')], ['این هفته با هفته قبل', 'این ماه با ماه قبل']);
            /* مقایسه‌ی منصفانه: بازه‌ی ناقصِ جاری با همان تعداد روزِ بازه‌ی کامل قبلی سنجیده می‌شود */
            const clamp = (cu, fu) => {
                if (cu.kind === 'months' && cu.keys.length === 1 && cu.keys[0] === S.curKey && !cu.upTo && fu.kind === 'months' && fu.keys.length === 1 && fu.keys[0] !== S.curKey && !fu.upTo) { clampNote = true; return RG.months(fu.keys, fu.label.replace(/\s*\(.*\)\s*$/, '') + ' (' + fa(S.day) + ' روز اول)', S.day); }
                if (cu.kind === 'days' && cu.from === S.ws && cu.to === S.T && fu.kind === 'days' && fu.to - fu.from === 6 && fu.to < S.ws) { clampNote = true; return RG.days(fu.from, fu.from + (S.T - S.ws), fu.label + ' (' + fa(S.T - S.ws + 1) + ' روز اول)'); }
                return fu;
            };
            let clampNote = false;
            r2 = clamp(r1, r2);
            if (!clampNote) r1 = clamp(r2.kind === 'months' || r2.kind === 'days' ? r2 : r1, r1) === r1 ? r1 : r1;
            la = r1.label; lb = r2.label; A = agg(gather(S, P, r1)); Bg = agg(gather(S, P, r2));
            P.clampNote = clampNote;
        }
        if (!A.n && !Bg.n) return R([B.p('در هیچ‌کدام از این دو داده‌ای ثبت نشده است.')], ['راهنما']);
        const keys = ['income', 'count', 'qty', 'avgval', 'latepct', 'perhour'].filter(k => mval(k, A) !== null || mval(k, Bg) !== null);
        const rows = keys.map(k => { const a = mval(k, A), b = mval(k, Bg), d = (a !== null && b !== null) ? delta(a, b, METRIC[k].up) : null; return [METRIC[k].l(S).replace(' هر روز کاری', ''), a === null ? '—' : METRIC[k].fmt(a), b === null ? '—' : METRIC[k].fmt(b), d && d.d !== null ? { t: (d.d >= 0 ? '▲' : '▼') + f(Math.abs(d.d)) + '٪', tone: d.tone } : '—']; });
        const blocks = [B.h((tp === 'entity' ? 'مقایسه: ' : 'مقایسه‌ی بازه‌ها: ') + la + ' و ' + lb), B.table(['', la, lb, 'تغییر'], rows)];
        const dI = delta(mval('income', A), mval('income', Bg), true);
        if (dI && dI.d !== null) {
            const parts = []; const nd = Bg.n ? (A.n - Bg.n) / Bg.n * 100 : null, vd = (mval('avgval', Bg) && mval('avgval', A) !== null) ? (mval('avgval', A) - mval('avgval', Bg)) / mval('avgval', Bg) * 100 : null;
            if (nd !== null && Math.abs(nd) >= 5) parts.push(`تعداد کارکرد ${f(Math.abs(nd))}٪ ${nd >= 0 ? 'بیشتر' : 'کمتر'}`);
            if (vd !== null && Math.abs(vd) >= 5) parts.push(`میانگین ارزش هر کارکرد ${f(Math.abs(vd))}٪ ${vd >= 0 ? 'بیشتر' : 'کمتر'}`);
            blocks.push(B.note(`${lab(S)} در ${la} ${dI.d >= 0 ? 'بالاتر' : 'پایین‌تر'} از ${lb} است${parts.length ? ' — چون ' + parts.join(' و ') : ''}.`, dI.tone));
        }
        if (tp === 'range' && P.clampNote) blocks.push(B.note('برای منصفانه بودن، بازه‌ی کامل قبلی فقط به اندازه‌ی همان تعداد روزِ بازه‌ی جاری سنجیده شد.', 'info'));
        return R(blocks, ['چرا؟', 'به تفکیک کد', tp === 'range' ? 'پیش‌بینی پایان ماه' : 'بیشترین تاخیر']);
    }

    /* ---------- «چرا؟»: ریشه‌یابی تغییر ---------- */
    function aWhy(S, P, ctxP) {
        const base = (ctxP && ctxP.range && !P.range) ? ctxP : P;
        let rg = P.range || (ctxP && ctxP.range) || RG.months([S.curKey], 'این ماه');
        const key = P.metric || (ctxP && ctxP.metric) || 'income';
        const Pf = { filters: (hasFilter(P) ? P.filters : (ctxP ? ctxP.filters : P.filters)) || newFilters() };
        const pr = P.ranges[1] || prevOf(rg, S);
        if (!pr) return R([B.p('برای بررسی علت تغییر، یک بازه‌ی قابل‌مقایسه (مثل ماه یا هفته) لازم است.')], ['این هفته چرا کم شد؟']);
        const A = gather(S, Pf, rg), Bl = gather(S, Pf, pr), a = agg(A), b = agg(Bl), M = METRIC[key];
        if (!a.n && !b.n) return R([B.p('داده‌ای برای بررسی نیست.')], ['راهنما']);
        const va = mval(key, a), vb = mval(key, b);
        if (va === null || vb === null) return R([B.p('برای این سنجه در یکی از دو بازه داده‌ای نیست.')], ['راهنما']);
        const d = delta(va, vb, M.up), blocks = [B.h(`چرا ${M.l(S)} ${va >= vb ? 'بالاتر' : 'پایین‌تر'} شد؟ (${rg.label} در برابر ${pr.label})`), B.p(`${M.fmt(va)} در برابر ${M.fmt(vb)} — ${d ? d.t.replace(' از دوره‌ی قبل', '') : ''}`)];
        const reasons = [];
        if (key === 'income' || key === 'count' || key === 'qty') {
            const nd = b.n ? (a.n - b.n) / b.n * 100 : null;
            if (nd !== null && Math.abs(nd) >= 5) reasons.push({ t: nd >= 0 ? 'good' : 'warn', x: `تعداد کارکرد ${f(Math.abs(nd))}٪ ${nd >= 0 ? 'بیشتر' : 'کمتر'} بوده (${f(a.n)} در برابر ${f(b.n)}).` });
            const avA = mval('avgval', a), avB = mval('avgval', b);
            if (avA !== null && avB) { const vd = (avA - avB) / avB * 100; if (Math.abs(vd) >= 5) reasons.push({ t: vd >= 0 ? 'good' : 'warn', x: `میانگین ارزش هر کارکرد ${f(Math.abs(vd))}٪ ${vd >= 0 ? 'بیشتر' : 'کمتر'} شده (${money(avA)} در برابر ${money(avB)}).` }); }
            if (a.days !== b.days && b.days) reasons.push({ t: a.days >= b.days ? 'good' : 'warn', x: `روزهای دارای ثبت: ${f(a.days)} در برابر ${f(b.days)}.` });
            const up = mval('avgunit', a), ub = mval('avgunit', b); if (up && ub && Math.abs(up - ub) / ub > 0.08) reasons.push({ t: 'info', x: `میانگین قیمت واحد ${up > ub ? 'افزایش' : 'کاهش'} یافته (${money(up)} در برابر ${money(ub)}).` });
            /* سهم کدها و پرسنل در تغییر */
            [['code', 'کد'], ['worker', 'پرسنل']].forEach(([dm, nm]) => {
                if (dm === 'worker' && !S.emp) return;
                const m1 = new Map(), m2 = new Map(), val = (x) => key === 'count' ? 1 : key === 'qty' ? x.qty : (x.inc || 0);
                const keyOf = dimDef(dm, S).key; A.forEach(x => { const k = keyOf(x); if (k) m1.set(k, (m1.get(k) || 0) + val(x)); }); Bl.forEach(x => { const k = keyOf(x); if (k) m2.set(k, (m2.get(k) || 0) + val(x)); });
                const all = uniq(Array.from(m1.keys()).concat(Array.from(m2.keys()))), nameOf = (k) => { const x = A.concat(Bl).find(z => keyOf(z) === k); return dm === 'code' ? 'کد ' + fa(x.codeRaw) : x.wn; };
                const ds = all.map(k => ({ k, d: (m1.get(k) || 0) - (m2.get(k) || 0) })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 2).filter(z => Math.abs(z.d) > 0);
                const tot = va - vb;
                ds.forEach(z => { if (Math.abs(z.d) >= Math.abs(tot) * 0.2 && all.length > 1) reasons.push({ t: z.d >= 0 ? 'good' : 'warn', x: `${nameOf(z.k)}: ${z.d >= 0 ? '+' : '−'}${f(Math.abs(z.d))}${key === 'income' ? ' ' + cur() : ''} نسبت به دوره‌ی قبل.` }); });
            });
        } else if (key === 'latepct' || key === 'late' || key === 'ontimepct') {
            const gc = groupBy(A.filter(x => x.late), 'code', S).rows.sort((x, y) => y.a.late - x.a.late)[0];
            if (gc) reasons.push({ t: 'warn', x: `بیشترین تاخیر در بازه‌ی جدید مربوط به کد ${fa(gc.list[0].codeRaw)} است (${f(gc.a.late)} مورد).` });
            if (S.emp) { const gw = groupBy(A.filter(x => x.late), 'worker', S).rows.sort((x, y) => y.a.late - x.a.late)[0]; if (gw) reasons.push({ t: 'warn', x: `بیشترین تاخیر پرسنلی: ${gw.name} (${f(gw.a.late)} مورد).` }); }
            const dA = mval('avgdur', a), dB = mval('avgdur', b); if (dA && dB && Math.abs(dA - dB) / dB > 0.1) reasons.push({ t: 'info', x: `میانگین مدت انجام ${dA > dB ? 'بیشتر' : 'کمتر'} شده است (${formatMinutesDuration(dA)} در برابر ${formatMinutesDuration(dB)}).` });
        } else {
            const mA = new Map(), mB = new Map();
            gather(S, Pf, rg).forEach(x => { if (x.code) { const o = mA.get(x.code) || { l: [], n: x.codeRaw }; o.l.push(x); mA.set(x.code, o); } });
            gather(S, Pf, pr).forEach(x => { if (x.code) { const o = mB.get(x.code) || { l: [], n: x.codeRaw }; o.l.push(x); mB.set(x.code, o); } });
            const ch = []; mA.forEach((o, k) => { const o2 = mB.get(k); if (!o2) return; const v1 = mval(key, agg(o.l)), v2 = mval(key, agg(o2.l)); if (v1 !== null && v2) ch.push({ n: o.n, d: (v1 - v2) / Math.abs(v2) * 100, v1, v2 }); });
            ch.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 3).forEach(z => { if (Math.abs(z.d) >= 5) reasons.push({ t: (z.d >= 0) === (M.up !== false) ? 'good' : 'warn', x: `کد ${fa(z.n)}: ${M.fmt(z.v1)} در برابر ${M.fmt(z.v2)} (${z.d >= 0 ? '+' : '−'}${f(Math.abs(z.d))}٪).` }); });
        }
        if (!reasons.length) reasons.push({ t: 'info', x: 'تغییر ناچیز است یا به یک عامل مشخص برنمی‌گردد.' });
        blocks.push(B.finds(reasons.slice(0, 5).map(r => ({ i: r.t === 'good' ? 'fa-arrow-up' : r.t === 'warn' ? 'fa-arrow-down' : 'fa-circle-info', t: r.t, x: r.x }))));
        return R(blocks, ['مقایسه کامل', 'به تفکیک کد', 'پیشنهادها']);
    }

    /* ---------- پیش‌بینی ---------- */
    function aForecast(S, P) {
        const weekly = /هفته/.test(norm(P.raw)) && !/ماه/.test(norm(P.raw));
        const hasF = hasFilter(P);
        const base = hasF ? S.recs.filter(x => matchRec(x, P.filters)) : S.recs;
        const mrecs = base.filter(x => x.mk === S.curKey), start = weekly ? S.ws : S.mStart, end = weekly ? S.ws + 6 : S.mEnd;
        const soFar = weekly ? sum(base.filter(x => x.jdn >= S.ws && x.jdn <= S.T), x => x.inc || 0) : sum(mrecs, x => x.inc || 0);
        if (!base.length) return R([B.p('هنوز داده‌ای برای پیش‌بینی نیست.')], ['راهنما']);
        const pj = project(S, end, soFar, base), goal = weekly ? S.goalW : S.goal, per = weekly ? 'این هفته' : 'این ماه';
        const blocks = [B.big(`پیش‌بینی ${lab(S)} تا پایان ${weekly ? 'هفته' : 'ماه'}${hasF ? ' — ' + fLabel(P) : ''}`, money(pj.proj), `بازه‌ی محتمل: ${f(pj.low)} تا ${f(pj.high)} ${cur()}`, 'info')];
        const rows = [[`تا الان (${per})`, money(soFar)], ['روزهای کاری باقی‌مانده (تخمینی)', f(pj.workLeft)], ['میانگین یک روز کاری', money(pj.ex.workMean)], ['اطمینان پیش‌بینی', pj.conf + (pj.conf === 'کم' ? ' (داده‌ی کم)' : '')]];
        blocks.push(B.kv(rows));
        const ref = weekly ? sum(base.filter(x => x.jdn >= S.ws - 7 && x.jdn <= S.ws - 1), x => x.inc || 0) : sum(base.filter(x => x.mk === S.prevKey), x => x.inc || 0);
        if (ref > 0) { const d = delta(pj.proj, ref, true); blocks.push(B.note(`${d.t.replace('دوره‌ی قبل', weekly ? 'هفته‌ی قبل' : 'ماه قبل')} (${money(ref)})`, d.tone)); }
        if (goal > 0) { const gap = goal - pj.proj; blocks.push(B.prog('هدف ' + (weekly ? 'هفتگی' : 'ماهانه'), Math.min(100, soFar / goal * 100), `${pctS(soFar / goal * 100)} از ${money(goal)}`, gap <= 0 ? 'good' : 'warn')); blocks.push(B.note(gap <= 0 ? 'با این روند به هدف می‌رسید.' : `با این روند ${money(gap)} به هدف کم می‌آید.`, gap <= 0 ? 'good' : 'warn')); }
        blocks.push(B.note('این پیش‌بینی از الگوی ۸ هفته‌ی اخیر و میانگین هر روز هفته ساخته شده، نه فقط میانگین ساده‌ی ماه.', 'info'));
        return R(blocks, [goal > 0 ? 'برای رسیدن به هدف چه کنم؟' : 'هدف', 'تحلیل هوشمند', 'مقایسه با ماه قبل']);
    }
    function aGoal(S, P) {
        const weekly = /هفته/.test(norm(P.raw)) && S.goalW > 0, goal = weekly ? S.goalW : (S.goal || S.goalW), isW = weekly || (!S.goal && S.goalW > 0);
        if (!(goal > 0)) return R([B.p('هدف درآمد هنوز تنظیم نشده است؛ از «تنظیمات ← هدف درآمد» وارد کنید تا پیش‌بینی و راهکار روزانه فعال شود.')], ['پیش‌بینی پایان ماه', 'راهنما']);
        const soFar = isW ? sum(S.recs.filter(x => x.jdn >= S.ws && x.jdn <= S.T), x => x.inc || 0) : sum(S.m, x => x.inc || 0), end = isW ? S.ws + 6 : S.mEnd;
        const left = goal - soFar, pj = project(S, end, soFar, S.recs);
        if (left <= 0) return R([B.big('هدف ' + (isW ? 'هفتگی' : 'ماهانه'), 'محقق شد 🎉', `${money(soFar)} از ${money(goal)}`, 'good')], ['پیش‌بینی پایان ماه', 'تحلیل هوشمند']);
        const dl = Math.max(1, pj.workLeft), need = left / dl;
        const blocks = [B.prog('هدف ' + (isW ? 'هفتگی' : 'ماهانه'), Math.min(100, soFar / goal * 100), `${pctS(soFar / goal * 100)} — ${money(soFar)} از ${money(goal)}`, 'info')];
        blocks.push(B.kv([['باقی‌مانده تا هدف', money(left)], ['روزهای کاری باقی‌مانده (تخمینی)', f(dl)], ['لازم است روزانه', money(need)], ['میانگین یک روز کاری شما', money(pj.ex.workMean)]]));
        if (pj.ex.workMean > 0) { const r = need / pj.ex.workMean; blocks.push(B.note(r <= 1 ? 'با همین سرعت فعلی به هدف می‌رسید.' : `باید روزانه حدود ${f((r - 1) * 100)}٪ بیشتر از معمول کار کنید.`, r <= 1 ? 'good' : 'warn')); }
        blocks.push(B.note(`پیش‌بینی با روند فعلی: ${money(pj.proj)} (${pj.proj >= goal ? 'بالاتر از' : 'پایین‌تر از'} هدف)`, pj.proj >= goal ? 'good' : 'warn'));
        return R(blocks, ['پیش‌بینی پایان ماه', 'برترین کدها', 'کدام کد بازده ساعتی بهتری دارد؟']);
    }

    /* ---------- کار جاری و وضعیت پرسنل ---------- */
    function aActive(S, P) {
        if (S.emp && typeof mgrWorkerState === 'function') {
            const act = S.workers.filter(w => w.active), F = P.filters;
            let sts = act.map(w => { try { return mgrWorkerState(w); } catch (e) { return null; } }).filter(Boolean);
            if (F.workers.length) sts = sts.filter(s => F.workers.some(w => w.n === norm(s.w.name)));
            if (sts.length) {
                const ord = { late: 0, urgent: 1, warn: 2, ok: 3, idle: 4 }; sts.sort((a, b) => ord[a.key] - ord[b.key] || b.pct - a.pct);
                const idleOnly = P.flags.idle, shown = idleOnly ? sts.filter(s => s.key === 'idle') : sts;
                const nIdle = sts.filter(s => s.key === 'idle').length, nLate = sts.filter(s => s.key === 'late').length, nWork = sts.length - nIdle - nLate;
                const blocks = [B.big(idleOnly ? 'پرسنل بیکار' : 'وضعیت زنده‌ی پرسنل', idleOnly ? f(nIdle) + ' نفر' : `${f(nWork)} در حال کار · ${f(nLate)} دیرکرد · ${f(nIdle)} بیکار`, '', nLate ? 'warn' : 'info')];
                if (!shown.length) blocks.push(B.p(idleOnly ? 'الان همه‌ی پرسنل کار دارند.' : 'پرسنلی پیدا نشد.'));
                else blocks.push(B.table(['نام', 'کار جاری', 'پیشرفت', 'وضعیت'], shown.slice(0, 12).map(s => [s.w.name, s.rec ? (s.rec.itemTitle || 'کد ' + fa(s.rec.itemCode)) : '—', s.rec ? pctS(Math.min(s.pct, 999)) : '—', { t: { late: 'دیرکرد', urgent: 'نزدیک موعد', warn: 'در حال کار', ok: 'در حال کار', idle: 'بیکار' }[s.key], tone: s.key === 'late' ? 'warn' : s.key === 'idle' ? 'info' : 'good' }])));
                return R(blocks, nLate ? ['کدام پرسنل بیشترین تاخیر را دارد؟', 'پرسنل'] : ['پرسنل', 'تحلیل هوشمند']);
            }
        }
        if (!S.act || !S.prog) return R([B.p('الان کار جاری‌ای در حال انجام نیست.')], ['امروز', 'خلاصه‌ی این ماه']);
        const r = S.act, p = S.prog, over = p.remainingMinutes < 0;
        const blocks = [B.big(r.itemTitle || r.itemCode || 'کار جاری', f(Math.min(p.percent, 999)) + '٪ پیش رفته', `کد ${fa(r.itemCode || '-')}${r.quantity ? ' · ' + f(num(r.quantity)) + ' عدد' : ''}`, over ? 'warn' : (p.percent >= 85 ? 'warn' : 'info')),
            B.prog('پیشرفت تا موعد', Math.min(100, p.percent), over ? formatMinutesDuration(p.remainingMinutes) + ' از موعد گذشته' : formatMinutesDuration(p.remainingMinutes) + ' تا موعد مانده', over ? 'warn' : 'info')];
        const kv = [['شروع', `${r.date} - ${r.time}`], ['مهلت هدف', r.workDuration || '—']];
        const hist = S.recs.filter(x => x.code === norm(r.itemCode) && x.dur !== null && x !== null && x.r !== r && x.dur > 0);
        if (hist.length >= 2) { const avg = sum(hist, x => x.dur) / hist.length, tgt = p.targetMinutes; kv.push(['میانگین مدت این کد در دفعات قبل', formatMinutesDuration(avg)]); blocks.push(B.kv(kv)); blocks.push(B.note(avg > tgt ? `معمولاً این کد بیشتر از مهلت هدف (${formatMinutesDuration(tgt)}) طول می‌کشد؛ احتمال تاخیر هست.` : `معمولاً این کد زودتر از مهلت هدف تمام می‌شود.`, avg > tgt ? 'warn' : 'good')); }
        else blocks.push(B.kv(kv));
        if (over) blocks.push(B.note('اگر کار تمام شده، «کار تمام شد» را بزنید تا آمار تاخیر دقیق شود.', 'warn'));
        return R(blocks, ['کارهای با تاخیر', 'امروز']);
    }

    /* ---------- فهرست رکوردها ---------- */
    function aList(S, P, mode) {
        const rg = P.range || (mode === 'first' ? RG.all() : (hasFilter(P) ? RG.all() : defaultRange(S, P)));
        if (P.flags.late && !P.filters.status) P.filters.status = 'late';
        const list = gather(S, P, rg);
        if (!list.length) return emptyAns(S, P, rg);
        const t = (x) => x.jdn * 1440 + (parseTimeToMinutes(x.r.time) || 0);
        const sorted = list.slice().sort(mode === 'first' ? (a, b) => t(a) - t(b) : P.sup ? (P.sup === 'min' ? (a, b) => (a.inc || 0) - (b.inc || 0) : (a, b) => (b.inc || 0) - (a.inc || 0)) : (a, b) => t(b) - t(a));
        const n = P.topN || (mode === 'last' || mode === 'first' ? 5 : 8), a = agg(list), L = fLabel(P);
        const blocks = [B.h(`${mode === 'first' ? 'قدیمی‌ترین' : mode === 'last' ? 'آخرین' : 'فهرست'} کارکردها${L ? ' — ' + L : ''} — ${rg.label}`), B.list(sorted.slice(0, n).map(x => recLine2(S, x).slice(2))),
            B.note(`${f(list.length)} کارکرد · ${f(a.qty)} عدد · ${money(a.inc)}${list.length > n ? ' — ' + f(list.length - n) + ' مورد دیگر هم هست' : ''}`, 'info')];
        return R(blocks, ['به تفکیک کد', 'مقایسه با دوره‌ی قبل', list.length > n ? 'بیشتر' : null]);
    }

    /* ---------- میانگین‌ها ---------- */
    function aAvgs(S, P) {
        const rg = P.range || defaultRange(S, P), list = gather(S, P, rg);
        if (!list.length) return emptyAns(S, P, rg);
        const a = agg(list), L = fLabel(P), rows = [];
        const add = (k, ttl) => { const v = mval(k, a); if (v !== null) rows.push([ttl || METRIC[k].l(S), METRIC[k].fmt(v)]); };
        add('avgval'); add('avgqty'); add('avgunit'); add('perday'); add('perdayn'); add('avgdur'); add('perhour'); add('ontimepct');
        return R([B.h('میانگین‌ها — ' + rg.label + (L ? ' — ' + L : '')), B.kv(rows)], ['مقایسه با دوره‌ی قبل', 'تحلیل هوشمند']);
    }

    /* ---------- تحلیل هوشمند ---------- */
    function aAnalysis(S, P) {
        const F = findings(S), blocks = [B.h('گزارش هوشمند ' + S.jc.monthName)];
        blocks.push(B.finds(F.slice(0, 9).map(o => ({ i: o.i, t: o.t, x: o.x }))));
        /* الگوی روزهای هفته و بازده کدها */
        const wd = groupBy(S.recs, 'weekday', S).rows.filter(r => r.k !== 6 || r.a.n >= 3).sort((x, y) => y.a.inc - x.a.inc);
        if (wd.length >= 3 && S.recs.length >= 12) blocks.push(B.note(`الگوی هفته: پردرآمدترین روز «${wd[0].name}» و ضعیف‌ترین «${wd[wd.length - 1].name}» است.`, 'info'));
        const ph2 = groupBy(S.recs, 'code', S).rows.filter(r => r.a.hDur > 0 && r.a.n >= 3).sort((x, y) => mval('perhour', y.a) - mval('perhour', x.a));
        if (ph2.length >= 2) blocks.push(B.note(`بازده ساعتی: کد ${fa(ph2[0].list[0].codeRaw)} (${money(mval('perhour', ph2[0].a))}) بهتر از کد ${fa(ph2[ph2.length - 1].list[0].codeRaw)} (${money(mval('perhour', ph2[ph2.length - 1].a))}) است.`, 'info'));
        const dd = groupBy(S.m, 'day', S).rows.sort((x, y) => x.k - y.k);
        if (dd.length >= 4) blocks.push(B.spark(dd.map(r => r.a.inc), dd.map(r => r.name), dd.reduce((i, r, j, z) => r.a.inc > z[i].a.inc ? j : i, 0)));
        const an = anomalies(S).slice(0, 2); if (an.length) blocks.push(B.note('نکته‌ی غیرعادی: ' + an[0].x, 'warn'));
        return R(blocks, ['پیشنهادها', 'روزهای غیرعادی', 'پیش‌بینی پایان ماه', 'مقایسه با ماه قبل']);
    }
    function aAnomaly(S) {
        const an = anomalies(S);
        if (!an.length) return R([B.p('در ۴۵ روز اخیر مورد غیرعادی (روز پرت، قیمت یا تعداد مشکوک) پیدا نشد. 👌')], ['تحلیل هوشمند', 'بررسی سلامت داده‌ها']);
        return R([B.h('موارد غیرعادی (۴۵ روز اخیر)'), B.finds(an.slice(0, 7).map(o => ({ i: o.t === 'good' ? 'fa-arrow-up' : 'fa-triangle-exclamation', t: o.t, x: o.x })))], ['بررسی سلامت داده‌ها', 'روزهای بدون کار']);
    }
    function aStreak(S) {
        const st = streaks(S);
        if (!st.best) return R([B.p('هنوز داده‌ای برای محاسبه‌ی پیوستگی کار نیست.')], ['راهنما']);
        let passed = 0; for (let j = S.mStart; j <= S.T; j++) if (S.wdOf(j) !== 6) passed++; const act = new Set(S.m.filter(x => S.wdOf(x.jdn) !== 6).map(x => x.jdn)).size; passed = Math.max(passed, act);
        return R([B.big('کار پشت سر هم (بدون احتساب جمعه‌ها)', f(st.cur) + ' روز', `بهترین رکورد شما: ${f(st.best)} روز`, st.cur >= 5 ? 'good' : 'info'), B.kv([['روزهای دارای ثبت این ماه', f(act) + ' از ' + f(passed) + ' روز کاری گذشته']])], ['روزهای بدون کار', 'تحلیل هوشمند']);
    }
    function aIdle(S, P) {
        if (!S.recs.length) return R([B.p('هنوز هیچ کارکردی ثبت نشده است.')], ['راهنما']);
        const rg = P.range && P.range.kind === 'days' ? P.range : RG.days(S.mStart, S.T, 'این ماه تا امروز');
        const days = idleDays(S, rg.from, Math.min(rg.to, S.T));
        if (!days.length) return R([B.p(`در «${rg.label}» هر روز کاری، کارکرد ثبت شده است. 👏`)], ['کار پشت سر هم', 'تحلیل هوشمند']);
        const runs = []; days.forEach(j => { const l = runs[runs.length - 1]; if (l && j - l.to <= 2 && (j - l.to === 1 || S.wdOf(l.to + 1) === 6)) l.to = j; else runs.push({ from: j, to: j }); });
        return R([B.big('روزهای بدون ثبت (جمعه‌ها حساب نشد)', f(days.length) + ' روز', rg.label, 'warn'), B.list(runs.slice(-6).reverse().map(r => r.from === r.to ? dayLong(S, r.from) : dayLong(S, r.from) + ' تا ' + dayLong(S, r.to)))], ['کار پشت سر هم', 'پیشنهادها']);
    }
    function aQuality(S) {
        const out = [], m = S.recs;
        const noP = m.filter(x => x.inc === null); if (noP.length) out.push({ i: 'fa-circle-question', t: 'warn', x: `${f(noP.length)} کارکرد قیمت ندارد (مثلاً کد ${fa(noP[noP.length - 1].codeRaw)} در ${noP[noP.length - 1].r.date}).` });
        const noDur = m.filter(x => x.dur === null && !x.open && x.judged); if (noDur.length > 3) out.push({ i: 'fa-hourglass', t: 'info', x: `${f(noDur.length)} کارکرد مدت انجام ثبت‌شده ندارد؛ تحلیل بازده ساعتی دقیق نمی‌شود.` });
        const stale = m.filter(x => x.open && x.jdn && S.T - x.jdn > 7); if (stale.length) out.push({ i: 'fa-folder-open', t: 'warn', x: `${f(stale.length)} کار بیش از ۷ روز باز مانده است؛ اگر تمام شده‌اند، پایان‌شان را ثبت کنید.` });
        const seen = new Map(); let dup = 0; m.forEach(x => { const k = [x.code, x.r.date, x.r.time, x.qty, x.wnn].join('|'); if (seen.has(k)) dup++; else seen.set(k, 1); }); if (dup) out.push({ i: 'fa-clone', t: 'warn', x: `${f(dup)} کارکرد تکراری (کد، زمان و تعداد یکسان) به نظر می‌رسد.` });
        const zero = m.filter(x => x.qty <= 0); if (zero.length) out.push({ i: 'fa-ban', t: 'warn', x: `${f(zero.length)} کارکرد تعداد صفر دارد.` });
        const an = anomalies(S).filter(z => z.t === 'warn' && /قیمت|تعداد/.test(z.x)).slice(0, 2); an.forEach(z => out.push({ i: 'fa-triangle-exclamation', t: 'warn', x: z.x }));
        if (!out.length) return R([B.p('داده‌ها سالم به نظر می‌رسند؛ مورد ناقص یا مشکوکی پیدا نشد. ✅')], ['تحلیل هوشمند']);
        return R([B.h('بررسی سلامت داده‌ها'), B.finds(out)], ['کارهای بدون قیمت', 'روزهای غیرعادی']);
    }
    function aTips(S, P) {
        const t = [], m = agg(S.m), lb = lab(S);
        if (S.act && S.prog && S.prog.remainingMinutes < 0) t.push({ i: 'fa-triangle-exclamation', t: 'warn', x: 'کار جاری از موعد گذشته؛ در صورت اتمام، پایان کار را ثبت کنید تا آمار تاخیر دقیق شود.' });
        else if (S.act && S.prog && S.prog.percent >= 85) t.push({ i: 'fa-stopwatch', t: 'warn', x: 'کار جاری به موعد نزدیک است؛ اولویت را به آن بدهید.' });
        if (m.judged >= 4 && m.late / m.judged > 0.3) {
            const gc = groupBy(S.m.filter(x => x.late), 'code', S).rows.sort((x, y) => y.a.late - x.a.late)[0];
            t.push({ i: 'fa-clock', t: 'warn', x: `${f(m.late / m.judged * 100)}٪ کارها با تاخیر تحویل شده${gc ? '؛ بیشترین تاخیر مربوط به کد ' + fa(gc.list[0].codeRaw) + ' است' : ''}. مهلت هدف را واقع‌بینانه‌تر بگذارید یا کار هم‌زمان را کم کنید.` });
        }
        const ph2 = groupBy(S.recs, 'code', S).rows.filter(r => r.a.hDur > 0 && r.a.n >= 3).sort((x, y) => mval('perhour', y.a) - mval('perhour', x.a));
        if (ph2.length >= 3 && mval('perhour', ph2[0].a) > mval('perhour', ph2[ph2.length - 1].a) * 1.3) t.push({ i: 'fa-ranking-star', t: 'good', x: `کد ${fa(ph2[0].list[0].codeRaw)} بازده ساعتی ${f(mval('perhour', ph2[0].a) / mval('perhour', ph2[ph2.length - 1].a))} برابری نسبت به کد ${fa(ph2[ph2.length - 1].list[0].codeRaw)} دارد؛ در صورت امکان آن را بیشتر بگیرید.` });
        if (S.goal > 0 && m.inc > 0 && S.day >= 3) { const pj = project(S, S.mEnd, m.inc, S.recs); if (pj.proj < S.goal) t.push({ i: 'fa-bullseye', t: 'warn', x: `با روند فعلی ${money(S.goal - pj.proj)} تا هدف کم می‌آید؛ روزی حدود ${money((S.goal - m.inc) / Math.max(1, pj.workLeft))} لازم است.` }); }
        if (!S.goal && !S.goalW) t.push({ i: 'fa-bullseye', t: 'info', x: 'هدف درآمد را تنظیم کنید تا پیش‌بینی و هشدار هدف فعال شود.' });
        const idle = S.recs.length ? idleDays(S, S.mStart, S.T - 1) : []; if (idle.length >= 3) t.push({ i: 'fa-calendar-xmark', t: 'info', x: `${f(idle.length)} روز کاری این ماه بدون ثبت مانده؛ اگر کار کرده‌اید ثبت کنید.` });
        { const unk = S.m.filter(x => x.inc === null).length; if (unk) t.push({ i: 'fa-circle-question', t: 'warn', x: `${f(unk)} کارکرد قیمت ندارد؛ با ثبت قیمت، ${lb} دقیق‌تر می‌شود.` }); }
        const gw = groupBy(S.recs, 'weekday', S).rows.filter(r => r.k !== 6).sort((x, y) => y.a.inc - x.a.inc); if (gw.length >= 4 && S.recs.length >= 15) t.push({ i: 'fa-calendar-week', t: 'info', x: `«${gw[0].name}» معمولاً پربازده‌ترین روز شماست؛ کارهای مهم‌تر را برای آن بگذارید.` });
        return R([B.h('پیشنهادهای داده‌محور'), t.length ? B.finds(t.slice(0, 7)) : B.p('مورد خاصی برای هشدار نیست؛ وضعیت خوب است. 👌')], ['تحلیل هوشمند', 'روزهای غیرعادی']);
    }

    /* ---------- جستجو و پیشنهاد ---------- */
    function aFind(S, P, V) {
        const toks = P.unknown.concat(P.filters.text.map(t => t.n));
        if (!toks.length) return aFallback(S, P);
        const hit = S.recs.filter(x => toks.every(t => x.hay.indexOf(t) >= 0));
        if (!hit.length) {
            const all = Object.keys(V.tok).filter(k => toks.some(t => lev(t, k, 2) <= 2)).slice(0, 3);
            return R([B.p(`چیزی برای «${toks.join(' ')}» پیدا نشد.`)], all.length ? all.map(k => 'کارهای ' + k) : ['راهنما']);
        }
        const a = agg(hit);
        return R([B.h(`${f(hit.length)} کارکرد مطابق «${toks.join(' ')}»`), B.note(`جمع: ${f(a.qty)} عدد — ${money(a.inc)}`, 'info'), B.list(hit.slice(-5).reverse().map(x => recLine2(S, x).slice(2)))], ['به تفکیک کد', 'مقایسه با دوره‌ی قبل']);
    }
    const CATALOG = [
        ['درآمد', 'درآمد امروز'], ['درآمد', 'درآمد این هفته'], ['درآمد', 'درآمد هر روز این ماه'], ['درآمد', 'بیشترین درآمد روزانه'], ['درآمد', 'میانگین درآمد روزانه'], ['درآمد', 'درآمد ماه قبل'],
        ['مقایسه', 'مقایسه این هفته با هفته قبل'], ['مقایسه', 'مقایسه این ماه با ماه قبل'], ['مقایسه', 'چرا درآمدم کم شد؟'],
        ['پیش‌بینی', 'پیش‌بینی پایان ماه'], ['پیش‌بینی', 'برای رسیدن به هدف روزی چقدر باید کار کنم؟'],
        ['کدها', 'برترین کدها'], ['کدها', 'کدام کد بازده ساعتی بهتری دارد؟'], ['کدها', '۵ کد برتر ۳ ماه اخیر'], ['کدها', 'کدام کد بیشترین تاخیر را دارد؟'],
        ['تاخیر', 'کارهای با تاخیر'], ['تاخیر', 'نرخ تاخیر این ماه'], ['تاخیر', 'تاخیرهای هفته‌ی قبل'],
        ['زمان', 'کدام روز هفته پرکارتر است؟'], ['زمان', 'ساعت‌های پرکار'], ['زمان', 'چند ساعت کار کردم؟'],
        ['تحلیل', 'تحلیل هوشمند وضعیت من'], ['تحلیل', 'روزهای غیرعادی'], ['تحلیل', 'روزهای بدون کار'], ['تحلیل', 'چند روز پشت سر هم کار کردم؟'], ['تحلیل', 'بررسی سلامت داده‌ها'], ['تحلیل', 'پیشنهادها'],
        ['فهرست', 'آخرین کارهای ثبت‌شده'], ['فهرست', 'کارهای بالای ۱ میلیون'], ['فهرست', 'میانگین‌ها'],
        ['پرسنل', 'عملکرد پرسنل این ماه', 1], ['پرسنل', 'کی بیکاره؟', 1], ['پرسنل', 'کدام کارگر بیشترین تاخیر را دارد؟', 1], ['پرسنل', 'درآمد بخش‌ها', 1]
    ];
    CATALOG.push(['گزارش', 'گزارش هفتگی'], ['گزارش', 'امروز چه کار کنم؟'], ['دانش', 'بازده ساعتی یعنی چه؟'], ['دانش', 'نرخ تاخیر یعنی چه؟'], ['دانش', 'چطور هدف درآمد را تنظیم کنم؟']);
    function aHelp(S) {
        const cats = {}; CATALOG.forEach(c => { if (c[2] && !S.emp) return; (cats[c[0]] = cats[c[0]] || []).push(c[1]); });
        const blocks = [B.p('**می‌توانید محاوره‌ای و با غلط املایی هم بپرسید.** سوال را با زمان، کد، نام پرسنل، رنگ یا مدل ترکیب کنید و بعد با «و ماه قبل؟»، «چرا؟» یا «به تفکیک روز» ادامه دهید.'),
            B.table(['نمونه', 'مثال'], [['زمان', 'امروز · دیروز · ۳ روز اخیر · هفته‌ی قبل · مهر · ۱۴۰۵/۰۷/۱۰'], ['فیلتر', 'کد ۶۴۴۹ · علی · بخش برش · کارهای بالای ۲ میلیون'], ['بُعد', 'هر روز · هر کد · روز هفته · ساعت · هر هفته'], ['سنجه', 'درآمد · تعداد · تاخیر · میانگین · بازده ساعتی · مدت'], ['گزارش', 'گزارش هفتگی · امروز چه کار کنم؟'], ['محاسبه', 'اگر ۲۰ عدد کد ۱۲۳ بزنم چقدر می‌شود؟ · برای رسیدن به ۲ میلیون چند عدد کد ۱۲۳ لازم است؟'], ['دانش', 'بازده ساعتی یعنی چه؟ · چطور هدف را تنظیم کنم؟'], ['تحلیل', 'مقایسه · چرا؟ · پیش‌بینی · هدف · غیرعادی']])];
        return R(blocks, ['درآمد هر روز این هفته', 'مقایسه با ماه قبل', 'تحلیل هوشمند', S.emp ? 'کی بیکاره؟' : 'روزهای بدون کار']);
    }
    function aFallback(S, P) {
        const q = norm(P.raw).split(' ').filter(w => w.length >= 2 && LX.stop.indexOf(w) < 0).map(stem);
        const sc = CATALOG.filter(c => !c[2] || S.emp).map(c => { const t = norm(c[1]).split(' ').map(stem); let s = 0; q.forEach(w => t.forEach(z => { if (z === w) s += 2; else if (near(z, w)) s += 1; })); return { c: c[1], s }; }).filter(z => z.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
        return R([B.p('دقیق متوجه نشدم. 🤔 می‌توانید زمان یا کد را هم اضافه کنید.'), sc.length ? B.note('شاید منظورتان یکی از این‌ها بود:', 'info') : B.note('یک نمونه از راهنما را امتحان کنید.', 'info')], sc.length ? sc.map(z => z.c) : ['راهنما', 'تحلیل هوشمند', 'درآمد امروز']);
    }
    function aGreet(S, P) {
        const h = new Date().getHours(), g = h < 4 ? 'شب' : h < 12 ? 'صبح' : h < 17 ? 'ظهر' : h < 20 ? 'عصر' : 'شب';
        if (P.flags.thanks) return R([B.p('خواهش می‌کنم! 🌟 هر وقت خواستید بپرسید.')], ['تحلیل هوشمند', 'راهنما']);
        const m = agg(S.m), t = agg(S.recs.filter(x => x.jdn === S.T));
        return R([B.p(`${g} بخیر! 👋 ${t.n ? `امروز ${f(t.n)} کارکرد (${money(t.inc)}) ثبت شده.` : 'امروز هنوز کارکردی ثبت نشده.'}${m.n ? ` از ابتدای ماه ${money(m.inc)} داشته‌اید.` : ''}`)], ['تحلیل هوشمند', 'امروز', 'پیش‌بینی پایان ماه', 'راهنما']);
    }
    function aDisambig(S, P) {
        const nq = norm(P.raw), tk = P.ambig.tok;
        return R([B.p(`چند نفر با نام «${tk}» داریم. منظورتان کدام‌یک است؟`)], P.ambig.list.slice(0, 4).map(n => tk ? nq.split(' ').map(w => w === tk ? n : w).join(' ') : n));
    }

    /* ============================ مسیریاب و زمینه ============================ */
    /* ============================ دانش‌نامه، محاسبه‌گر و گزارش‌های تکمیلی ============================ */
    const GLOSS = [
        { k: ['بازده ساعتی', 'بازدهی ساعتی', 'درامد ساعتی'], t: 'بازده ساعتی', a: 'ارزش کار تقسیم بر ساعت‌های واقعی انجام آن. فقط کارهایی حساب می‌شوند که هم قیمت و هم مدت انجام ثبت‌شده دارند؛ عدد بالاتر یعنی آن کد به‌صرفه‌تر است.', c: ['کدام کد بازده ساعتی بهتری دارد؟'] },
        { k: ['نرخ تاخیر', 'درصد تاخیر'], t: 'نرخ تاخیر', a: 'سهم کارهای دیرتحویل از کارهایی که وضعیت تحویلشان مشخص است (به‌موقع، تاخیر، زودتر از موعد). کارهای هنوز باز در این نرخ نمی‌آیند.', c: ['نرخ تاخیر این ماه'] },
        { k: ['روز کاری', 'روزهای کاری'], t: 'روز کاری', a: 'روزی که دست‌کم یک کارکرد در آن ثبت شده. در شمارش روزهای بدون ثبت و پیوستگی کار، جمعه‌ها حساب نمی‌شوند.', c: ['روزهای بدون کار'] },
        { k: ['پیش بینی', 'پیشبینی'], t: 'پیش‌بینی پایان ماه', a: 'از میانگین هر روز هفته در ۸ هفته‌ی اخیر ساخته می‌شود: ارزش تا امروز + انتظار روزهای باقی‌مانده. بازه‌ی محتمل از نوسان روزانه به‌دست می‌آید و اطمینان آن به تعداد روزهای دارای داده بستگی دارد.', c: ['پیش‌بینی پایان ماه'] },
        { k: ['غیرعادی', 'ناهنجاری'], t: 'روز یا مورد غیرعادی', a: 'روزهایی که ارزششان در ۴۵ روز اخیر خیلی از میانگین دور است، به‌علاوه قیمت واحد یا تعدادِ پرت در هر کد (بیش از ۳۰٪ اختلاف قیمت یا بیش از ۳ برابر تعداد معمول).', c: ['روزهای غیرعادی'] },
        { k: ['پشت سر هم', 'پیوستگی'], t: 'کار پشت سر هم', a: 'تعداد روزهای کاری متوالی که کارکرد ثبت کرده‌اید؛ جمعه‌ها زنجیره را قطع نمی‌کنند.', c: ['چند روز پشت سر هم کار کردم؟'] },
        { k: ['سلامت داده', 'کیفیت داده'], t: 'سلامت داده‌ها', a: 'بررسی کارکردهای بدون قیمت یا مدت، تکراری، با تعداد صفر، کارهای بیش از ۷ روز بازمانده و مقادیر مشکوک؛ هرچه داده کامل‌تر باشد تحلیل دقیق‌تر است.', c: ['بررسی سلامت داده‌ها'] },
        { k: ['ارزش کار'], t: 'ارزش کار', a: 'در حالت کارفرما، مجموع ارزش کارکردهای ثبت‌شده‌ی پرسنل؛ در حالت پرسنل همان درآمد شماست.', c: ['درآمد این ماه'] },
        { k: ['قیمت واحد'], t: 'قیمت واحد', a: 'قیمت هر عدد در یک کارکرد؛ ارزش کل معمولاً از ضرب آن در تعداد به‌دست می‌آید. اگر قیمت یک کد ناگهان عوض شود، در «روزهای غیرعادی» هشدار می‌گیرید.', c: ['میانگین‌ها'] }
    ];
    const KB = [
        { k: ['هدف'], v: ['تنظیم', 'وارد', 'ست', 'بذار', 'بزار', 'تعریف', 'کجا', 'فعال'], a: 'از «تنظیمات ← هدف درآمد» مبلغ هدف ماهانه (و در صورت نیاز هفتگی) را وارد کنید. بعد از آن «پیش‌بینی پایان ماه»، «هدف» و پیشنهادهای روزانه برایتان فعال می‌شود.', c: ['هدف', 'پیش‌بینی پایان ماه'] },
        { k: ['کار تمام', 'تمام شد', 'پایان کار', 'اتمام کار', 'ببندم', 'تموم شد'], a: 'در کارت «کار جاری» دکمه‌ی «کار تمام شد» را بزنید تا زمان پایان ثبت شود. اگر نزنید کار باز می‌ماند و آمار تاخیر دقیق نمی‌شود.', c: ['کار جاری', 'کارهای با تاخیر'] },
        { k: ['ویجت'], s: 1, a: 'ویجت پیشرفت کار جاری میزان پیشرفت تا موعد را نشان می‌دهد و با دکمه‌ی «کار تمام شد» کار را می‌بندد؛ جزئیات کار مرتبط هم همان‌جا دیده می‌شود.', c: ['کار جاری'] },
        { k: ['افلاین', 'اینترنت', 'سرور', 'حریم'], s: 1, a: 'دستیار کاملاً آفلاین و روی همین دستگاه کار می‌کند: همه‌ی تحلیل‌ها از کارکردهای ذخیره‌شده‌ی خود برنامه ساخته می‌شود و چیزی به اینترنت یا سرور فرستاده نمی‌شود.', c: ['راهنما'] },
        { k: ['حالت کارفرما', 'حالت پرسنل', 'کارفرما'], s: 1, a: 'در حالت کارفرما دستیار روی کارکرد همه‌ی پرسنل و بخش‌ها کار می‌کند (عملکرد نفرات، بیکارها، مقایسه‌ی افراد، تاخیر هر نفر). در حالت پرسنل فقط کارکردهای خودتان تحلیل می‌شود.', c: ['کی بیکاره؟', 'عملکرد پرسنل این ماه'] },
        { k: ['کپی', 'پاک کردن'], a: 'گوشه‌ی هر پاسخ آیکن کپی هست که متن آن را کپی می‌کند، و «پاک کردن گفتگو» بالای گفتگو، پرسش‌ها و زمینه‌ی گفتگو را پاک می‌کند.', c: ['راهنما'] }
    ];
    const DEFQ = /(یعنی|چیه|چی هست|معنی|تعریف|توضیح|(چطور|چجوری|چگونه|چه جوری) (محاسبه|حساب)|محاسبه میشه)/;
    const HOWQ = /(چطور|چگونه|چجوری|چه جوری|چطوری|کجا|آموزش|راهنمای|میتونم|میشه)/;
    function topicMatch(nq, list, keys) {
        const qt = nq.split(' ').map(stem); let best = null, bs = 0;
        list.forEach(e => keys(e).forEach(k => { const kt = norm(k).split(' ').map(stem); if (kt.every(t => qt.some(z => z === t || near(z, t)))) { const sc = kt.length * 2 + 1; if (sc > bs) { bs = sc; best = e; } } }));
        return best;
    }
    function aWhatIf(S, V, nq) {
        const t = nq.split(' '); let code = null;
        for (let i = 0; i < t.length && !code; i++) { const z = t[i] === 'کد' ? t[i + 1] : t[i]; if (z && Object.prototype.hasOwnProperty.call(V.codes, z) && (z.length >= 3 || /[a-z]/.test(z))) code = z; }
        if (!code) return null;
        const q2 = ' ' + nq + ' ', mq = /(?: |^)(\d+(?:\.\d+)?) ?(عدد|تا|دانه|قطعه)(?= )/.exec(q2), mt = /(?:رسیدن به|برسم به|معادل|به مبلغ) (\d+(?:\.\d+)?) ?(میلیون|هزار|میلیارد)?(?= )/.exec(q2);
        const reverse = !!mt && /(چند|چه تعداد)/.test(nq), forward = !!mq && /(اگه|اگر|فرض|محاسبه|حساب کن|بزنم|بسازم|تولید کنم|انجام بدم|چقدر میشه|چقدر در میاد|چقدر درمیاد)/.test(nq) && !/(بالای|زیر|حداقل|حداکثر|کمتر از|بیشتر از)/.test(nq);
        if (!reverse && !forward) return null;
        const nm = 'کد ' + fa(V.codes[code]), hist = S.recs.filter(x => x.code === code && x.unit > 0).sort((a, b) => b.jdn - a.jdn);
        if (!hist.length) return R([B.p(`برای ${nm} قیمت واحدی ثبت نشده؛ نمی‌توانم محاسبه کنم.`)], [nm]);
        const u = hist[0].unit, us = hist.map(x => x.unit), mn = Math.min.apply(null, us), mx = Math.max.apply(null, us);
        const dq = S.recs.filter(x => x.code === code && x.dur > 0 && x.qty > 0), perU = dq.length ? sum(dq, x => x.dur) / sum(dq, x => x.qty) : null;
        const rows = []; let big;
        if (reverse) { const target = parseFloat(mt[1]) * ({ میلیون: 1e6, هزار: 1e3, میلیارد: 1e9 }[mt[2]] || 1), need = Math.ceil(target / u); big = B.big('برای رسیدن به ' + money(target), f(need) + ' عدد ' + nm, 'قیمت واحد آخرین ثبت: ' + money(u), 'info'); if (perU) rows.push(['زمان تقریبی (خطی)', formatMinutesDuration(perU * need)]); }
        else { const q = parseFloat(mq[1]); big = B.big(f(q) + ' عدد ' + nm, money(q * u), 'قیمت واحد آخرین ثبت: ' + money(u), 'info'); if (perU) rows.push(['زمان تقریبی (خطی)', formatMinutesDuration(perU * q)]); }
        if (mn !== mx) rows.unshift(['بازه‌ی قیمت واحد در سابقه', `${money(mn)} تا ${money(mx)}`]);
        const bl = [big]; if (rows.length) bl.push(B.kv(rows));
        bl.push(B.note('محاسبه بر پایه‌ی قیمت واحد آخرین ثبت همین کد است؛ اگر نرخ عوض شده باشد نتیجه هم عوض می‌شود.', 'info'));
        return R(bl, [nm, 'برترین کدها']);
    }
    function aWeekReport(S) {
        const cw = RG.days(S.ws, S.T, 'این هفته'), pw = RG.days(S.ws - 7, S.ws - 7 + (S.T - S.ws), 'هفته‌ی قبل');
        const L = S.recs.filter(x => inR(x, cw)), a = agg(L), b = agg(S.recs.filter(x => inR(x, pw)));
        if (!a.n) return R([B.p('در این هفته هنوز کارکردی ثبت نشده است.')], ['هفته‌ی قبل', 'خلاصه‌ی این ماه']);
        const d = dlt('income', a, b), blocks = [B.big('گزارش هفتگی — ' + lab(S), money(a.inc), `${f(a.n)} کارکرد · ${f(a.qty)} عدد · ${f(a.days)} روز دارای ثبت`, d ? d.tone : 'info')];
        if (d && b.n) blocks.push(B.note(`${d.t} (هفته‌ی قبل تا همین روز: ${money(b.inc)})`, d.tone));
        const rows = [], dd = groupBy(L, 'day', S).rows.sort((x, y) => x.k - y.k);
        if (dd.length) { const bd = dd.reduce((m, r) => r.a.inc > m.a.inc ? r : m, dd[0]); rows.push(['بهترین روز', `${bd.name} — ${money(bd.a.inc)}`]); }
        const gc = groupBy(L, 'code', S).rows.sort((x, y) => y.a.inc - x.a.inc)[0]; if (gc) rows.push(['پرارزش‌ترین کد', `${gc.name} — ${money(gc.a.inc)}`]);
        if (S.emp) { const gw = groupBy(L, 'worker', S).rows.sort((x, y) => y.a.inc - x.a.inc)[0]; if (gw) rows.push(['برترین نفر', `${gw.name} — ${money(gw.a.inc)}`]); }
        if (a.judged) rows.push(['نرخ تحویل به‌موقع', pctS((a.judged - a.late) / a.judged * 100)]);
        const idl = idleDays(S, S.ws, S.T - 1); if (idl.length) rows.push(['روزهای بدون ثبت', idl.map(j => WD[S.wdOf(j)]).join('، ')]);
        if (rows.length) blocks.push(B.kv(rows));
        if (S.goalW > 0) blocks.push(B.prog('هدف هفتگی', Math.min(100, a.inc / S.goalW * 100), `${pctS(a.inc / S.goalW * 100)} از ${money(S.goalW)}`, a.inc >= S.goalW ? 'good' : 'info'));
        if (dd.length >= 3) blocks.push(B.spark(dd.map(r => r.a.inc), dd.map(r => r.name), dd.reduce((i, r, j, z) => r.a.inc > z[i].a.inc ? j : i, 0)));
        return R(blocks, ['مقایسه این هفته با هفته قبل', 'درآمد هر روز این هفته', 'تحلیل هوشمند']);
    }
    function aPlan(S) {
        if (!S.recs.length) return R([B.p('هنوز کارکردی ثبت نشده؛ بعد از ثبت اولین کار، برنامه‌ی پیشنهادی ساخته می‌شود.')], ['راهنما']);
        const t = [], c = cur(), ex = expectation(S), today = agg(S.recs.filter(x => x.jdn === S.T)), typ = ex.E[S.wdOf(S.T)], m = agg(S.m);
        if (S.act && S.prog) { const nm = S.act.itemTitle || S.act.itemCode || 'کار جاری'; t.push(S.prog.remainingMinutes < 0 ? { i: 'fa-triangle-exclamation', t: 'warn', x: `اول «${nm}»: از موعد گذشته؛ تمامش کنید یا پایانش را ثبت کنید.` } : { i: 'fa-stopwatch', t: S.prog.percent >= 85 ? 'warn' : 'info', x: `اول «${nm}» را جلو ببرید (${f(Math.min(S.prog.percent, 999))}٪ پیش رفته، حدود ${f(S.prog.remainingMinutes / 60)} ساعت تا موعد).` }); }
        if (typ > 0) t.push({ i: 'fa-sun', t: today.inc >= typ ? 'good' : 'info', x: today.inc >= typ ? `امروز از حد معمولِ روز ${WD[S.wdOf(S.T)]} (حدود ${f(typ)} ${c}) جلوترید.` : `در روز ${WD[S.wdOf(S.T)]} معمولاً حدود ${f(typ)} ${c} ثبت می‌شود؛ تا الان ${f(today.inc)} ${c} ثبت شده.` });
        if (S.goal > 0) { const left = S.goal - m.inc, dl = Math.max(1, project(S, S.mEnd, m.inc, S.recs).workLeft); t.push(left <= 0 ? { i: 'fa-trophy', t: 'good', x: 'هدف ماهانه محقق شده است.' } : { i: 'fa-bullseye', t: 'info', x: `برای هدف ماهانه از امروز روزی حدود ${f(left / dl)} ${c} لازم است.` }); }
        const bt = groupBy(S.recs, 'code', S).rows.filter(r => r.a.hDur > 0 && r.a.n >= 3).sort((x, y) => mval('perhour', y.a) - mval('perhour', x.a))[0];
        if (bt) t.push({ i: 'fa-ranking-star', t: 'info', x: `اگر انتخاب دارید، کد ${fa(bt.list[0].codeRaw)} با ${money(mval('perhour', bt.a))} در ساعت بهترین بازده را دارد.` });
        const stale = S.recs.filter(x => x.open && x.jdn && S.T - x.jdn > 7).length; if (stale) t.push({ i: 'fa-folder-open', t: 'warn', x: `${f(stale)} کار بیش از ۷ روز باز مانده؛ وضعیتشان را روشن کنید.` });
        if (!t.length) t.push({ i: 'fa-circle-info', t: 'info', x: 'مورد فوری‌ای دیده نمی‌شود؛ کارکرد جدید را ثبت کنید.' });
        return R([B.h('برنامه‌ی پیشنهادی امروز'), B.finds(t.slice(0, 5))], ['تحلیل هوشمند', 'کار جاری', 'پیش‌بینی پایان ماه']);
    }
    /* پیش‌مسیریاب: سوال‌های دانشی، محاسبه‌گر، گزارش هفتگی، برنامه‌ی امروز و گپ کوتاه؛ در غیر این صورت null */
    function extra(raw, S, V) {
        const nq = wordNums(norm(raw)); if (!nq) return null;
        const n = nq.split(' ').filter(Boolean).length;
        if (n <= 6) {
            if (/((تو|شما) (کی|چی)( هستی| هستید| هست)?$)|اسمت|اسم تو|کی ساختت/.test(nq)) return R([B.p('من دستیار هوشمند همین برنامه‌ام و کاملاً آفلاین روی دستگاه شما کار می‌کنم؛ کارکردها، درآمد، تاخیرها و روندتان را تحلیل می‌کنم و به پرسش‌هایتان پاسخ می‌دهم.')], ['راهنما', 'تحلیل هوشمند']);
            if (/^(خداحافظ|بای|فعلا|خدانگهدار|موفق باشی)/.test(nq)) return R([B.p('موفق و پردرآمد باشید! 🌟 هر وقت خواستید برگردید.')], ['تحلیل هوشمند']);
            if (/^(خوبی|حالت چطوره|احوالت|چطوری)$/.test(nq)) return R([B.p('ممنون، آماده‌ام! 😊 چه کمکی از من برمی‌آید؟')], ['تحلیل هوشمند', 'امروز', 'راهنما']);
        }
        if (/(گزارش|خلاصه|وضعیت|مرور)( ی)?( این)? (هفته|هفتگی)/.test(nq) && !/(قبل|گذشته|پیش) /.test(nq + ' ')) return aWeekReport(S);
        if (/امروز (چه|چی)( کار| کاری)? (کنم|بکنم|انجام بدم|بدم|باید انجام)|برنامه( ی)? (امروز|روز)|اولویت( ی)?( های)? امروز|امروز از کجا شروع/.test(nq)) return aPlan(S);
        const wi = aWhatIf(S, V, nq); if (wi) return wi;
        if (DEFQ.test(nq)) { const g = topicMatch(nq, GLOSS, e => e.k); if (g) return R([B.h(g.t), B.p(g.a)], (g.c || []).concat(['راهنما'])); }
        const kb = KB.find(e => topicMatch(nq, [e], x => x.k) && (!e.v || e.v.some(v => nq.indexOf(v) >= 0)) && (HOWQ.test(nq) || (e.s && n <= 7)));
        if (kb) return R([B.p(kb.a)], (kb.c || []).concat(['راهنما']));
        return null;
    }
    /* حافظه‌ی پرسش‌های پرتکرار (فقط روی همین دستگاه) برای پیشنهاد سریع */
    const FKEY = 'ai_freq_v1';
    function freqRead() { try { const o = JSON.parse(localStorage.getItem(FKEY) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
    function freqAdd(q) {
        try {
            const t = String(q).trim(); if (t.length < 4 || t.length > 80) return;
            const o = freqRead(), k = norm(t), e = o[k] || { q: t, n: 0, t: 0 }; e.n++; e.t = Date.now(); e.q = t; o[k] = e;
            const ks = Object.keys(o); if (ks.length > 60) ks.sort((a, b) => (o[a].n - o[b].n) || (o[a].t - o[b].t)).slice(0, ks.length - 60).forEach(z => { delete o[z]; });
            localStorage.setItem(FKEY, JSON.stringify(o));
        } catch (e) { /* ذخیره نشد */ }
    }
    function freqTop(n) { const o = freqRead(); return Object.keys(o).map(k => o[k]).filter(e => e && e.n >= 2 && e.q).sort((a, b) => b.n - a.n || b.t - a.t).slice(0, n).map(e => e.q); }

    const ctx = { plan: null };
    function inherit(P, c) {
        if (!c) return P;
        const F = P.filters, cf = c.filters;
        if (!P.metric && c.metric) { P.metric = c.metric; P.metricExplicit = c.metricExplicit; }
        if (!P.range && c.range) P.range = c.range;
        if (!P.dim && c.dim && !(F.workers.length && c.dim === 'worker') && !(F.codes.length && c.dim === 'code') && !(F.sections.length && c.dim === 'section')) P.dim = c.dim;
        if (!P.sup && c.sup) P.sup = c.sup;
        if (!P.topN && c.topN) P.topN = c.topN;
        ['codes', 'workers', 'sections', 'text'].forEach(k => { if (!F[k].length && cf[k].length) F[k] = cf[k].slice(); });
        ['status', 'wd', 'minV', 'maxV', 'minQ', 'maxQ'].forEach(k => { if ((F[k] === null) && cf[k] !== null) F[k] = cf[k]; });
        return P;
    }
    function route(raw) {
        const S = build(), V = vocab(S);
        const X = extra(raw, S, V); if (X) return X;
        const P = parse(raw, S, V), fl = P.flags, F = P.filters, c = ctx.plan;
        const anyIntent = fl.help || fl.why || fl.forecast || fl.goal || fl.compare || fl.analysis || fl.summary || fl.anomaly || fl.streak || fl.idle || fl.quality || fl.tips || fl.active || fl.last || fl.first || fl.list || fl.find;
        const anySlot = !!(P.metric || P.dim || P.sup);
        const hasEntity = P.entities > 0 || F.text.length > 0 || F.status || F.wd !== null || F.minV !== null || F.maxV !== null || F.minQ !== null || F.maxQ !== null;
        if (P.ambig) return aDisambig(S, P);
        if ((fl.greet || fl.thanks) && !anyIntent && !anySlot && P.tokenCount <= 5) return aGreet(S, P);
        if (fl.help && P.tokenCount <= 6) return aHelp(S);
        let res;
        /* ادامه‌ی گفتگو (سوال ناقص) */
        if (fl.more && c && !anyIntent) { const P2 = inherit(P, c); P2.topN = (c.topN || 8) * 2; P2.intent = c.intent; return finish(P2, runIntent(S, V, P2, c.intent || 'agg', c), S); }
        const conj = /^(و|پس|یا) /.test(norm(raw)), elliptic = !anyIntent && !anySlot && c && (conj || fl.pron || (P.range && P.tokenCount <= 4));
        if (elliptic) { const P2 = inherit(P, c); return finish(P2, runIntent(S, V, P2, c.intent || 'overview', c), S); }
        if (fl.why) { return finish(P, aWhy(S, P, c), S); }
        if (fl.compare) { if (c && !P.range && !P.ranges.length && !F.workers.length && !F.codes.length) { inherit(P, c); } return finish(P, aCompare(S, P, c), S, 'compare'); }
        if (fl.forecast) return finish(P, aForecast(S, P), S, 'forecast');
        if (fl.goal) return finish(P, aGoal(S, P), S, 'goal');
        if (fl.anomaly) return finish(P, aAnomaly(S), S);
        if (fl.streak) return finish(P, aStreak(S), S);
        if (fl.idle && !(S.emp && (fl.who || /پرسنل|کارگر|نفر/.test(norm(raw))))) return finish(P, aIdle(S, P), S);
        if (fl.quality && !P.metric) return finish(P, aQuality(S), S);
        if (fl.tips) return finish(P, aTips(S, P), S);
        if (fl.active || (fl.idle && S.emp)) { if (fl.idle) fl.idle = true; return finish(P, aActive(S, P), S); }
        if ((fl.analysis || fl.summary) && !hasEntity && !P.range && !anySlot) return finish(P, aAnalysis(S, P), S);
        if (fl.last || fl.first) return finish(P, aList(S, P, fl.last ? 'last' : 'first'), S, 'list');
        if (fl.list || ((fl.late || P.filters.status) && !anySlot && !fl.rate && !P.metric) || ((F.minV !== null || F.maxV !== null || F.minQ !== null || F.maxQ !== null) && !anySlot)) return finish(P, aList(S, P, 'list'), S, 'list');
        if (fl.late && !P.metric) { P.metric = 'late'; }
        /* بدون سنجه و بُعد اما با کلمه‌ی «میانگین» */
        if (fl.avg && !P.metric && !P.dim) return finish(P, aAvgs(S, P), S, 'avgs');
        if (P.dim && !P.metric && !P.sup && !P.flags.busy && ['code', 'worker', 'section', 'title', 'color'].indexOf(P.dim) >= 0) return finish(P, aTable(S, P), S, 'table');
        if (P.metric || P.dim || P.sup) return finish(P, aAgg(S, P), S, 'agg');
        if (hasEntity || P.range) return finish(P, aOverview(S, P), S, 'overview');
        if (fl.analysis || fl.summary) return finish(P, aAnalysis(S, P), S);
        if (P.unknown.length || fl.find) return finish(P, aFind(S, P, V), S);
        return aFallback(S, P);
    }
    function runIntent(S, V, P, intent, c) {
        switch (intent) {
            case 'agg': if (P.dim && !P.metric && !P.sup && ['code', 'worker', 'section', 'title', 'color'].indexOf(P.dim) >= 0) return aTable(S, P); return aAgg(S, P);
            case 'table': return aTable(S, P);
            case 'list': return aList(S, P, 'list');
            case 'compare': return aCompare(S, P, c);
            case 'avgs': return aAvgs(S, P);
            case 'forecast': return aForecast(S, P);
            case 'goal': return aGoal(S, P);
            default: return aOverview(S, P);
        }
    }
    function finish(P, res, S, intent) {
        if (intent && !P.intent) P.intent = intent;
        if (!P.intent) P.intent = (P.metric || P.dim || P.sup) ? 'agg' : 'overview';
        if (['agg', 'table', 'list', 'overview', 'compare', 'avgs'].indexOf(P.intent) >= 0) ctx.plan = { intent: P.intent, metric: P.metric, metricExplicit: P.metricExplicit, dim: P.dim, range: P.range, filters: JSON.parse(JSON.stringify(P.filters)), sup: P.sup, topN: P.topN };
        return res;
    }
    function answer(raw) {
        try { return route(raw); }
        catch (e) { try { console.warn('[AI]', e); } catch (z) { /* بی‌اهمیت */ } return R([B.p('در پردازش این سوال مشکلی پیش آمد. لطفاً آن را کمی ساده‌تر یا به شکل دیگری بپرسید.')], ['راهنما', 'تحلیل هوشمند']); }
    }

    /* ============================ دستورهای چت: اجرای کار از داخل گفتگو ============================ */
    const CMD = { pend: null, undo: [], acts: {}, seq: 0, hist: [], hi: -1, forceAuto: false };
    const AUTO_KEY = 'ai_cmd_auto_v1';
    const nz = (s) => toEnglishDigits(String(s == null ? '' : s)).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064b-\u065f\u0640]/g, '');
    const autoOn = () => { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch (e) { return false; } };
    const todayJ = () => parseJalaliDateToJdn(getCurrentJalaliInfo().fullDateStr);
    const jStr = (j) => { const d = d2j(j); return toPersianDigits(d.jy) + '/' + toPersianDigits(d.jm) + '/' + toPersianDigits(d.jd); };
    const recKey = (r) => (parseJalaliDateToJdn(r.date) || 0) * 1440 + (parseTimeToMinutes(r.time) || 0);
    const gl = (k) => { try { return getFormLabel(k); } catch (e) { return k; } };
    const optF = (k) => { try { return isFieldOptional(k); } catch (e) { return false; } };
    const p2 = (n) => String(n).padStart(2, '0');
    const mgrIsOn = () => { try { return typeof mgrOn === 'function' && mgrOn(); } catch (e) { return false; } };
    const reg = (fn, grp) => { const id = 'c' + (++CMD.seq); CMD.acts[id] = { fn, used: false, grp: grp || id }; const ks = Object.keys(CMD.acts); if (ks.length > 80) delete CMD.acts[ks[0]]; return id; };
    const btn = (t, id, tone) => ({ t, id, tone });
    const BT = (items) => ({ k: 'btns', items });
    const WARN = (t) => R([B.note(t, 'warn')]);
    const YES = /^(بله|بلی|اره|ارع|تایید|اوکی|ok|okay|باشه|انجام بده|انجام|درسته|ثبت کن|بزن|حله)$/;
    const NO = /^(نه|خیر|لغو|کنسل|بیخیال|نمیخوام|نکن|انصراف|نه ممنون)$/;
    const QW = /^(چقدر|چند|کی|کدام|کدوم|چرا|چه|چی|آیا|چطور|چگونه|کجا)( |$)/;
    const STOP = /^(کن|بکن|بزن|را|رو|بده|بذار|بزار|بشه|بشود|شود|باشه|و|با|به|در|لطفا|هم|ثبت|جدید|کار|کارکرد|رکورد)$/;
    const KW = { code: ['کد', 'کدجدید'], qty: ['تعداد', 'مقدار'], price: ['قیمت', 'نرخ', 'مبلغ', 'فی', 'تعرفه', 'دستمزد', 'کارمزد'], title: ['عنوان', 'مدل', 'محصول', 'آیتم', 'شرح'], color: ['رنگ'], worker: ['پرسنل', 'کارگر', 'برای', 'توسط', 'کارمند'], date: ['تاریخ'], time: ['ساعت'], status: ['وضعیت'] };
    const WDN = { 'شنبه': 0, 'یکشنبه': 1, 'دوشنبه': 2, 'سهشنبه': 3, 'چهارشنبه': 4, 'پنجشنبه': 5, 'جمعه': 6 };
    const CMD_TPL = ['ثبت کد  تعداد  قیمت ', 'پایان کار', 'قیمت کد  را  کن', 'تعداد آخرین ثبت را  کن', 'حذف آخرین ثبت', 'یادداشت فردا: ', 'یادآوری فردا ساعت ۹ ', 'برو به لیست', 'برو به یادداشت‌ها', 'فیلتر لیست ', 'حالت تاریک', 'پشتیبان بگیر', 'خروجی CSV', 'بازگردانی', 'دستورها'];

    function cfWords(f) { const c = String(f.label).replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim(); const w = c.split(' ').filter(x => x.length > 2 && !/^(شماره|نوع|نام|کد)$/.test(x)); return w.length ? w : [c]; }
    function amt(a) {
        const m = /(\d+(?:\.\d+)?)\s*(هزار|میلیون|میلیارد|k)?/i.exec((a || []).join(' ')); if (!m) return null;
        let v = parseFloat(m[1]); const u = (m[2] || '').toLowerCase();
        if (u === 'هزار' || u === 'k') v *= 1e3; else if (u === 'میلیون') v *= 1e6; else if (u === 'میلیارد') v *= 1e9;
        return Math.round(v);
    }
    /* استخراج فیلدهای فرم از متن آزاد (ترتیب‌ناپذیر): کد، عنوان، رنگ، تعداد، قیمت، پرسنل، فیلدهای سفارشی */
    function fields(text) {
        let s = nz(text).replace(/(\d)[,٬،](?=\d{3}(?!\d))/g, '$1').replace(/[،؛;,:：]/g, ' ').replace(/\s+/g, ' ').trim();
        s = wordNums(s);
        const U = String((appSettings && appSettings.qtyUnit) || 'عدد').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!/(^| )(تعداد|مقدار)( |$)/.test(s)) s = s.replace(new RegExp('(^| )(\\d+) (عدد|تا|دست|جفت|متر|کیلو|بسته|پرس|لیوان|مورد|' + U + ')(?= |$)'), '$1تعداد $2');
        if (!/(^| )(قیمت|نرخ|مبلغ|فی|تعرفه|دستمزد|کارمزد)( |$)/.test(s)) s = s.replace(/(^| )(\d+(?: (?:هزار|میلیون|میلیارد))?) (?:تومان|تومن|ریال)(?= |$)/, '$1قیمت $2');
        const kmap = {}; Object.keys(KW).forEach(k => KW[k].forEach(w => { kmap[w] = k; }));
        const cf = ((appSettings && appSettings.customFields) || []).filter(x => x && x.id && x.label);
        cf.forEach(x => cfWords(x).forEach(w => { kmap[w] = 'cf:' + x.id; }));
        const T = s.split(' ').filter(Boolean), out = {}, lead = []; let cur = null;
        for (let i = 0; i < T.length; i++) {
            const t = T[i], k = kmap[t];
            if (k) { cur = k; if (!out[k]) out[k] = []; continue; }
            if (/^(شماره|نوع|نام)$/.test(t) && kmap[T[i + 1]]) continue;
            if (cur) out[cur].push(t); else lead.push(t);
        }
        const trim = (a) => { a = (a || []).slice(); while (a.length && STOP.test(a[0])) a.shift(); while (a.length && STOP.test(a[a.length - 1])) a.pop(); return a; };
        const S = { cf: {}, keyed: Object.keys(out).length > 0 };
        if (out.code) { const a = trim(out.code); if (a.length) S.code = a[0]; }
        else { const c = trim(lead).find(t => /^[A-Za-z0-9][A-Za-z0-9\-_\/]*$/.test(t)); if (c) S.code = c; }
        if (out.qty) { const n = trim(out.qty).map(t => parsePersianInt(t)).find(x => x > 0); if (n) S.qty = n; }
        if (out.price) { const v = amt(trim(out.price)); if (v != null) S.price = v; }
        ['title', 'color'].forEach(k => { if (out[k]) { const a = trim(out[k]); if (a.length) S[k] = a.join(' ').slice(0, 100); } });
        if (out.worker) { const a = trim(out.worker); if (a.length) S.workerText = a.join(' '); }
        cf.forEach(x => { const a = out['cf:' + x.id]; if (!a) return; const b = trim(a); if (b.length) S.cf[x.id] = x.type === 'number' ? String(amt(b) || '') : b.join(' ').slice(0, 100); });
        return S;
    }
    /* تاریخ و ساعت از متن: امروز/فردا/پس‌فردا/N روز دیگر/نام روز هفته/تاریخ دقیق/ساعت ۹ عصر/۱۰ دقیقه دیگر */
    function whenOf(text) {
        let s = ' ' + nz(text).replace(/پس ?فردا/g, 'پسفردا') + ' '; const t0 = todayJ(), o = { j: null, time: null, repeat: null, rest: '' }; let m;
        const cut = (str) => { s = s.replace(str, ' '); };
        if ((m = /هر (روز|هفته|ماه)/.exec(s))) { o.repeat = { 'روز': 'daily', 'هفته': 'weekly', 'ماه': 'monthly' }[m[1]]; cut(m[0]); }
        if ((m = /(\d+|نیم) (دقیقه|ساعت) (?:دیگه|دیگر|بعد)/.exec(s))) {
            const v = m[1] === 'نیم' ? 0.5 : +m[1], d = new Date(Date.now() + v * (m[2] === 'ساعت' ? 3600e3 : 60e3));
            o.time = p2(d.getHours()) + ':' + p2(d.getMinutes()); o.j = t0 + (d.getDate() !== new Date().getDate() ? 1 : 0); cut(m[0]);
        }
        let mm = /ساعت (\d{1,2})(?::(\d{2}))?( و نیم)?(?: (صبح|ظهر|عصر|شب|بعد ?از ?ظهر))?/.exec(s);
        if (!mm) { const m2 = /(?:^|\s)(\d{1,2}):(\d{2})(?: (صبح|ظهر|عصر|شب|بعد ?از ?ظهر))?(?=\s)/.exec(s); if (m2) mm = [m2[0], m2[1], m2[2], null, m2[3]]; }
        if (mm && !o.time) {
            let h = +mm[1]; const mi = mm[2] ? +mm[2] : (mm[3] ? 30 : 0), pd = mm[4] || '';
            if (/عصر|بعد/.test(pd) && h < 12) h += 12; else if (/شب/.test(pd)) { if (h === 12) h = 0; else if (h < 12 && h >= 5) h += 12; } else if (/ظهر/.test(pd) && h < 7) h += 12;
            if (h <= 23 && mi <= 59) { o.time = p2(h) + ':' + p2(mi); cut(mm[0]); }
        }
        const base = o.j; o.j = null;
        try {
            if (/پسفردا/.test(s)) { o.j = t0 + 2; cut(/پسفردا/); }
            else if (/(^|\s)فردا(\s|$)/.test(s)) { o.j = t0 + 1; cut(/(^|\s)فردا(?=\s)/); }
            else if (/دیروز/.test(s)) { o.j = t0 - 1; cut(/دیروز/); }
            else if (/امروز|امشب/.test(s)) { o.j = t0; cut(/امروز|امشب/); }
            else if ((m = /(\d+) (روز|هفته|ماه) (?:دیگه|دیگر|بعد|آینده)/.exec(s))) { o.j = t0 + (+m[1]) * ({ 'روز': 1, 'هفته': 7, 'ماه': 30 }[m[2]]); cut(m[0]); }
            else if ((m = /(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(s))) { o.j = j2d(+m[1], +m[2], +m[3]); cut(m[0]); }
            else if ((m = /(?:^|\s)(\d{1,2})\/(\d{1,2})(?=\s)/.exec(s))) { const cj = d2j(t0); let j = j2d(cj.jy, +m[1], +m[2]); if (j < t0) j = j2d(cj.jy + 1, +m[1], +m[2]); o.j = j; cut(m[0]); }
            else if ((m = /(یک ?شنبه|دو ?شنبه|سه ?شنبه|چهار ?شنبه|پنج ?شنبه|جمعه|شنبه)/.exec(s))) { const wd = WDN[m[1].replace(/ /g, '')]; let dl = (wd - ((t0 + 2) % 7) + 7) % 7; if (dl === 0) dl = 7; o.j = t0 + dl; cut(m[0]); }
        } catch (e) { o.j = null; }
        if (o.j == null) o.j = base;
        o.rest = s.replace(/\s+/g, ' ').trim();
        return o;
    }
    function pickWorker(txt) {
        if (!txt || !mgrIsOn()) return { w: null };
        const q = normalizeSearchText(txt), L = mgr().workers.filter(w => w.active !== false);
        let m = L.filter(w => normalizeSearchText(w.name) === q);
        if (!m.length) m = L.filter(w => { const x = normalizeSearchText(w.name); return x.includes(q) || q.includes(x); });
        return m.length === 1 ? { w: m[0] } : { w: null, err: m.length ? 'چند پرسنل با این نام هست: ' + m.map(x => x.name).join('، ') : 'پرسنلی با نام «' + txt + '» پیدا نشد.' };
    }
    function selOf(raw) {
        let s = nz(raw).replace(/کد\s+جدید/g, 'کدجدید'); const sel = {}; let m;
        if ((m = /(?:^|\s)کد\s+(\S+)/.exec(s))) { sel.code = normalizeCodeValue(m[1]); s = s.replace(m[0], ' '); }
        if (/(^|\s)(آخرین|اخرین|آخر|قبلی|همین)(\s|$)/.test(s)) sel.last = true;
        if ((m = /(?:پرسنل|کارگر|کارمند)\s+(\S+)/.exec(s))) { const p = pickWorker(m[1]); if (p.w) { sel.workerId = p.w.id; s = s.replace(m[0], ' '); } }
        sel.rest = s; return sel;
    }
    function findRecs(sel) {
        let L = allRecords.slice();
        if (sel.code) L = L.filter(r => normalizeCodeValue(r.itemCode).toLowerCase() === String(sel.code).toLowerCase());
        if (sel.workerId) L = L.filter(r => r.workerId === sel.workerId);
        return L.sort((a, b) => recKey(b) - recKey(a) || (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    const recRows = (r) => {
        const rows = [[gl('itemCode'), String(r.itemCode || '-')]];
        if (r.itemTitle) rows.push([gl('itemTitle'), r.itemTitle]); if (r.itemColor) rows.push([gl('itemColor'), r.itemColor]);
        rows.push([gl('receivedQuantity'), fa(f(r.quantity || 0))]); rows.push([gl('unitPrice'), r.unitPrice == null ? 'نامشخص' : money(r.unitPrice)]);
        rows.push(['تاریخ', fa(String(r.date || '') + ' ' + (r.time || ''))]); if (r.workerName) rows.push(['پرسنل', r.workerName]);
        return rows;
    };

    /* ---------- تشخیص دستور ---------- */
    function detect(raw) {
        if (/^\s*\/+\s*$/.test(String(raw || ''))) return { t: 'help' };
        const r = String(raw || '').trim().replace(/^\/+\s*/, ''); if (!r || /[؟?]/.test(r)) return null;
        const n = norm(r); if (!n || QW.test(n)) return null; const T = (re) => re.test(n);
        if (T(/^(دستور(ها|ات)?|راهنمای دستور(ها|ات)?|لیست دستور(ها|ات)?)$/)) return { t: 'help' };
        if (T(/^(بازگردان\S*|برگردان|برگرد|undo|لغو (کن )?(آخرین|عملیات|دستور)|پشیمون\S*)$/)) return { t: 'undo' };
        if (T(/^(پاک|حذف) (کردن )?(گفتگو|چت|تاریخچه)/)) return { t: 'clear' };
        if (T(/(تایید|تاییدیه) ?(خودکار|اتوماتیک)|اجرای مستقیم|بدون (تایید|پرسش)/)) return { t: 'auto', on: !/(خاموش|غیرفعال|قطع|لغو)/.test(n) };
        if (T(/^(به من |بهم |برام )?(یادداشت|یاد داشت|یاداوری|یاد اوری|یادم بنداز|یادم باشه|نوت|تعطیلی)( |$)/)) return { t: 'note' };
        if (T(/^(برو|ببر|باز کن|بازکن|برگرد) ?(به|توی|تو|در)? ?(صفحه|تب|بخش|منوی)? ?(لیست|کارکرد|رکورد|جدول|ثبت|فرم|یادداشت|پیشرفت|کار جاری|کارفرما|پنل|خانه|اصلی|تنظیمات|سطل|بازیافت)/)) return { t: 'nav' };
        if (T(/^(تم|حالت|پوسته|برنامه|صفحه)( را| رو)? ?(تاریک|دارک|شب)( کن| بکن| شو| شود)?$|^(تاریک|دارک) (کن|بکن|شو)$/)) return { t: 'theme', dark: true };
        if (T(/^(تم|حالت|پوسته|برنامه|صفحه)( را| رو)? ?(روشن|لایت|روز)( کن| بکن| شو| شود)?$/)) return { t: 'theme', dark: false };
        if (T(/(کارفرما).*(روشن|خاموش|فعال|غیرفعال)|(روشن|خاموش|فعال|غیرفعال) (کن|بکن).*کارفرما/)) return { t: 'mgr', on: !/(خاموش|غیرفعال)/.test(n) };
        if (T(/(پشتیبان|بکاپ|backup)/) && T(/(بگیر|بده|بساز|تهیه|دانلود|ذخیره)/)) return { t: 'backup' };
        if (T(/(خروجی|اکسل|csv|دانلود)/) && T(/(اکسل|csv|کارکرد|رکورد|لیست|حقوق)/) && !T(/(پشتیبان|بکاپ)/)) return { t: 'csv', pay: T(/حقوق/) };
        if (T(/^(چاپ|پرینت)( |$)/)) return { t: 'print' };
        if (T(/(پاک|حذف|ریست) (کردن |کن )?(فیلتر|جستجو)|^فیلتر (را )?(بردار|خاموش)/)) return { t: 'filter', clear: true };
        if (T(/^(فیلتر|جستجو|سرچ)( کن| بکن)?( در| توی)? ?(لیست|جدول|کارکرد)/)) return { t: 'filter' };
        if (T(/^(افزودن|اضافه|ثبت|ایجاد)( کن)? (پرسنل|کارگر|کارمند)( جدید)?( |$)|^(پرسنل|کارگر|کارمند) جدید( |$)/)) return { t: 'worker' };
        if (T(/^(غیرفعال|فعال) (کن )?(پرسنل|کارگر|کارمند)( |$)/)) return { t: 'wtoggle', on: /^فعال/.test(n) };
        if (T(/^(پایان|اتمام|ختم)( دادن)?( (کار|کد).*)?$|^(تمامش|تمومش|تموم|تمام) (کن|بکن|شد)|(^| )(تمام|تموم) شد( |$)/)) return { t: 'finish' };
        if (T(/^(حذف|پاک|دلیت)( کن)?( |$)/)) return { t: 'delete' };
        const sel = T(/(^| )(کد \S+|آخرین|اخرین|قبلی|همین)( |$)/), fld = T(/(^| )(تعداد|قیمت|نرخ|عنوان|رنگ|مقدار|کد جدید)( |$)/);
        if ((T(/^(ویرایش|اصلاح|تغییر|عوض|اپدیت|بروزرسانی|به روز)( |$)/) && (sel || fld)) || (sel && fld && T(/(کن|بکن|بشه|بذار|بزار|بده|شود|باشه)$/))) return { t: 'edit' };
        if (T(/^(ثبت|اضافه|افزودن|وارد|درج|ایجاد|بزن)( کن| کار| کارکرد| رکورد| جدید)*( |$)/) || (T(/^کد \S+ .*(تعداد|قیمت) \d/))) return { t: 'create' };
        return null;
    }

    /* ---------- کارت تایید و اجرا ---------- */
    function ask(plan) {
        if ((autoOn() || CMD.forceAuto) && !plan.danger) return runPlan(plan);
        const g = 'g' + (++CMD.seq), yes = reg(() => runPlan(plan), g), no = reg(() => R([B.p('لغو شد؛ تغییری اعمال نشد.')]), g);
        CMD.pend = { kind: 'confirm', yes, no, ts: Date.now() };
        const bl = [B.h(plan.title)]; if (plan.rows && plan.rows.length) bl.push(B.kv(plan.rows)); if (plan.warn) bl.push(B.note(plan.warn, 'warn'));
        bl.push(BT([btn(plan.ok || 'تایید و اجرا', yes, plan.danger ? 'bad' : 'ok'), btn('لغو', no, 'no')]));
        return R(bl, []);
    }
    function runPlan(plan) {
        CMD.pend = null; let x;
        try { x = plan.exec(); } catch (e) { try { console.warn('[AI-CMD]', e); } catch (z) { /* بی‌اهمیت */ } x = { ok: false, msg: 'اجرای دستور با خطا مواجه شد؛ تغییری اعمال نشد.' }; }
        if (!x.ok) return R([B.note(x.msg || 'انجام نشد.', 'warn')]);
        const bl = [B.note('✓ ' + x.msg, 'good')]; if (x.rows) bl.push(B.kv(x.rows));
        if (x.undo) { const ent = { label: plan.title, fn: x.undo, done: false }; CMD.undo.push(ent); if (CMD.undo.length > 15) CMD.undo.shift(); bl.push(BT([btn('↩ بازگردانی', reg(() => doUndo(ent)), 'no')])); }
        return R(bl, x.chips || []);
    }
    function doUndo(ent) {
        if (ent.done) return WARN('این مورد قبلاً بازگردانده شده است.'); ent.done = true; let m;
        try { m = ent.fn(); } catch (e) { m = 'بازگردانی ناموفق بود.'; }
        return R([B.note('↩ ' + (m || 'بازگردانی شد.'), 'good')]);
    }
    function useAct(id) {
        const a = CMD.acts[id]; if (!a) return WARN('این دستور دیگر معتبر نیست.'); if (a.used) return WARN('قبلاً انجام شده است.');
        Object.keys(CMD.acts).forEach(k => { if (CMD.acts[k].grp === a.grp) CMD.acts[k].used = true; });
        CMD.pend = null; return a.fn();
    }

    /* ---------- ثبت رکورد ---------- */
    function cCreate(raw) {
        const S = fields(raw), W = whenOf(raw), t = nz(raw);
        if (isManualDeliveryMode() && !isDeadlineMode()) { if (/به موقع/.test(t)) S.status = 'به موقع'; else if (/زودتر/.test(t)) S.status = 'زودتر از موعد'; else if (/تاخیر/.test(t)) S.status = 'تاخیر'; }
        return createFlow(S, W);
    }
    function createFlow(S, W) {
        if (S.workerText) { const p = pickWorker(S.workerText); if (p.err) return WARN(p.err); if (p.w) { S.workerId = p.w.id; S.workerName = p.w.name; } delete S.workerText; }
        if (W.j != null && !S.date) S.date = jStr(W.j); if (W.time && !S.time) S.time = W.time;
        const need = [['code', 'itemCode'], ['title', 'itemTitle'], ['color', 'itemColor'], ['qty', 'receivedQuantity'], ['price', 'unitPrice']];
        if (isManualDeliveryMode() && !isDeadlineMode()) need.push(['status', 'itemStatus']);
        for (let i = 0; i < need.length; i++) { const k = need[i][0], id = need[i][1]; if (S[k] !== undefined) continue; if (id !== 'itemStatus' && optF(id)) continue; return askSlot(S, W, k, id); }
        return ask({
            title: 'ثبت رکورد جدید', ok: 'تایید و ثبت', exec: () => execCreate(S),
            rows: [[gl('itemCode'), S.code || '-'], S.title ? [gl('itemTitle'), S.title] : null, S.color ? [gl('itemColor'), S.color] : null, S.qty != null ? [gl('receivedQuantity'), fa(f(S.qty))] : null,
                S.price != null ? [gl('unitPrice'), money(S.price)] : null, (S.qty != null && S.price != null) ? ['مبلغ کل', money(S.qty * S.price)] : null, S.status ? ['وضعیت', S.status] : null,
                S.date ? ['تاریخ', fa(S.date)] : null, S.time ? ['ساعت', fa(S.time)] : null, S.workerName ? ['پرسنل', S.workerName] : null]
                .concat(Object.keys(S.cf).map(id => { const c = cfList().find(x => x.id === id); return [c ? c.label : id, S.cf[id]]; })).filter(Boolean)
        });
    }
    function askSlot(S, W, k, id) {
        const g = 'g' + (++CMD.seq), cancel = reg(() => { CMD.pend = null; return R([B.p('لغو شد.')]); }, g);
        CMD.pend = { kind: 'slot', ts: Date.now(), cont: (raw) => slotCont(S, W, k, id, raw) };
        const label = id === 'itemStatus' ? 'وضعیت تحویل' : gl(id), items = (k === 'status' ? ['به موقع', 'تاخیر', 'زودتر از موعد'] : []).map(c => btn(c, reg(() => slotCont(S, W, k, id, c), g), 'ok'));
        items.push(btn('لغو', cancel, 'no'));
        return R([B.p('«' + label + '» را بنویسید:' + ((k === 'title' || k === 'color') ? ' (برای رد کردن «-» بفرستید)' : '')), BT(items)], []);
    }
    function slotCont(S, W, k, id, raw) {
        CMD.pend = null; const t = nz(raw).trim(), skip = /^(-|—|ندارد|بدون|هیچ)$/.test(t), F = fields(raw);
        const bad = () => { const r = askSlot(S, W, k, id); r.blocks.unshift(B.note('مقدار واردشده معتبر نیست.', 'warn')); return r; };
        if (F.keyed) {
            ['code', 'qty', 'price', 'title', 'color', 'workerText'].forEach(x => { if (F[x] !== undefined) S[x] = F[x]; }); Object.assign(S.cf, F.cf);
            const W2 = whenOf(raw); if (W2.j != null) W.j = W2.j; if (W2.time) W.time = W2.time;
            if (S[k] === undefined) return bad();
        } else if (k === 'code') { S.code = normalizeCodeValue(t.split(' ')[0]); if (!S.code) return bad(); }
        else if (k === 'qty') { const v = parsePersianInt(wordNums(t)); if (v <= 0) return bad(); S.qty = v; }
        else if (k === 'price') { const v = amt(wordNums(t).split(' ')); if (v == null) return bad(); S.price = v; }
        else if (k === 'status') { S.status = /زودتر/.test(t) ? 'زودتر از موعد' : /تاخیر/.test(t) ? 'تاخیر' : /موقع/.test(t) ? 'به موقع' : ''; if (!S.status) return bad(); }
        else S[k] = skip ? '' : t.slice(0, 100);
        return createFlow(S, W);
    }
    function execCreate(S) {
        const $e = (i) => document.getElementById(i), put = (i, v) => { const el = $e(i); if (el) el.value = v; };
        if ($e('editingRecordId').value || isRecordFormDirty()) return { ok: false, msg: 'فرم «ثبت» نیمه‌پر یا در حال ویرایش است؛ ابتدا آن را تکمیل یا خالی کنید.' };
        const before = new Set(allRecords.map(r => r.id)), bt = $e('actionFeedbackText'); if (bt) bt.innerText = '';
        put('itemCode', S.code || ''); put('itemTitle', S.title || ''); put('itemColor', S.color || '');
        put('receivedQuantity', S.qty != null ? String(S.qty) : ''); put('unitPrice', S.price != null ? String(S.price) : '');
        Object.keys(S.cf).forEach(id => put('cf_' + id, S.cf[id]));
        if (S.workerId && $e('recordWorker')) put('recordWorker', S.workerId);
        try { if (S.date) { put('recordDate', S.date); recordDateTouched = true; } if (S.time) { put('recordTime', S.time); recordTimeTouched = true; } } catch (e) { /* بی‌اهمیت */ }
        if (isManualDeliveryMode() && !isDeadlineMode() && S.status) {
            put('itemStatus', S.status); toggleDeliveryDurationField();
            if (S.status !== 'به موقع') { const c = $e('deliveryDurationUnknown'); if (c) { c.checked = true; toggleDeliveryDurationUnknown(); } }
        } else runAutoDeliveryCalculation();
        handleFormSubmit({ preventDefault() { } });
        const rec = allRecords.find(r => !before.has(r.id));
        if (!rec) { const why = bt ? bt.innerText : ''; try { resetFormState(); } catch (e) { /* بی‌اهمیت */ } return { ok: false, msg: 'ثبت انجام نشد' + (why ? ': ' + why : '.') }; }
        return { ok: true, msg: 'رکورد ثبت شد' + (rec.status ? ' — وضعیت: ' + rec.status : '') + '.', rows: recRows(rec), chips: rec.finishedDate ? [] : ['پایان کار کد ' + (rec.itemCode || '')], undo: () => delRec(rec.id) ? 'ثبت لغو شد (رکورد در سطل بازیافت است).' : 'رکورد دیگر وجود ندارد.' };
    }
    function delRec(id) {
        const removed = allRecords.find(r => r.id === id); if (!removed) return false;
        addTombstone('records', id); moveToTrash(TRASH_RECORDS_STORE, removed);
        allRecords = allRecords.filter(r => r.id !== id);
        const owner = allRecords.find(r => recOwnerKey(r) === recOwnerKey(removed) && sameDT(r.nextCodeStartDate, r.nextCodeStartTime, removed.date, removed.time)); if (owner) syncNextCodeStartLink(owner);
        saveRecords(); renderDashboard(); addLog('یک رکورد از طریق چت حذف شد.', 'warn'); return true;
    }
    function restoreSnap(snap, msg) {
        const i = allRecords.findIndex(r => r.id === snap.id); if (i < 0) return 'رکورد دیگر وجود ندارد.';
        snap.updatedAt = Date.now(); allRecords[i] = snap; try { recomputeAllLinks(); } catch (e) { /* بی‌اهمیت */ }
        saveRecords(); renderDashboard(); return msg;
    }

    /* ---------- پایان کار ---------- */
    function cFinish(raw) {
        const sel = selOf(raw), W = whenOf(sel.rest); let rec;
        if (sel.code || sel.last || sel.workerId) { rec = findRecs(sel).find(r => !r.finishedDate); if (!rec) return WARN('کار بازِ (پایان‌نیافته‌ی) مطابق این مشخصات پیدا نشد.'); }
        else { rec = getCurrentActiveRecord(); if (!rec) return WARN('کار جاری‌ای وجود ندارد. می‌توانید بگویید «پایان کار کد ۶۴۴۹».'); }
        const now = new Date(), date = W.j != null ? jStr(W.j) : getCurrentJalaliInfo().fullDateStr, time = W.time || (p2(now.getHours()) + ':' + p2(now.getMinutes()));
        return ask({ title: 'پایان کار', ok: 'ثبت پایان', rows: recRows(rec).concat([['زمان پایان', fa(date + ' ' + time)]]), exec: () => execFinish(rec.id, date, time) });
    }
    function execFinish(id, date, time) {
        const rec = allRecords.find(r => r.id === id); if (!rec || rec.finishedDate) return { ok: false, msg: 'این کار دیگر باز نیست.' };
        const snap = JSON.parse(JSON.stringify(rec));
        rec.finishedDate = date; rec.finishedTime = time; rec.updatedAt = Date.now();
        evaluateDeliveryAgainst(rec, rec.finishedDate, rec.finishedTime);
        saveRecords(); renderDashboard(); if (typeof mgrPageW !== 'undefined' && mgrPageW) mgrCloseWorkerPage();
        checkDeliveryProgressNotifications(); addLog('پایان کار کد ' + (rec.itemCode || '-') + ' از چت ثبت شد (' + rec.status + ').', 'success');
        return { ok: true, msg: 'کار کد ' + (rec.itemCode || '-') + ' تمام شد — وضعیت: ' + (rec.status || '-') + (rec.durationTime ? ' (' + rec.durationTime + ')' : ''), undo: () => restoreSnap(snap, 'ثبت پایان کار لغو شد.') };
    }

    /* ---------- ویرایش ---------- */
    function cEdit(raw) {
        const sel = selOf(raw); if (!sel.code && !sel.last && !sel.workerId) return WARN('کدام ثبت؟ مثال: «قیمت کد ۶۴۴۹ را ۱۵ هزار کن» یا «تعداد آخرین ثبت را ۶۰ کن».');
        const rec = findRecs(sel)[0]; if (!rec) return WARN('رکوردی با این مشخصات پیدا نشد.');
        const F = fields(sel.rest), ch = {}, rows = [];
        const add = (key, label, oldV, newV, show) => { ch[key] = newV; rows.push([label, (show ? show(oldV) : (oldV || '-')) + ' ← ' + (show ? show(newV) : newV)]); };
        if (/کدجدید/.test(sel.rest) && F.code) add('itemCode', gl('itemCode'), rec.itemCode, F.code);
        if (F.title !== undefined) add('itemTitle', gl('itemTitle'), rec.itemTitle, F.title);
        if (F.color !== undefined) add('itemColor', gl('itemColor'), rec.itemColor, F.color);
        if (F.qty !== undefined) add('quantity', gl('receivedQuantity'), rec.quantity, F.qty, v => fa(f(v || 0)));
        if (F.price !== undefined) add('unitPrice', gl('unitPrice'), rec.unitPrice, F.price, v => v == null ? 'نامشخص' : money(v));
        Object.keys(F.cf).forEach(id => { const c = cfList().find(x => x.id === id); ch['cf:' + id] = F.cf[id]; rows.push([c ? c.label : id, (cfVal(rec, id) || '-') + ' ← ' + F.cf[id]]); });
        if (!rows.length) return WARN('چه چیزی تغییر کند؟ مثال: «تعداد کد ' + (rec.itemCode || '۶۴۴۹') + ' را ۶۰ کن» یا «قیمت آخرین ثبت را ۱۵ هزار کن».');
        return ask({ title: 'ویرایش رکورد کد ' + (rec.itemCode || '-'), ok: 'تایید و ذخیره', rows, exec: () => execEdit(rec.id, ch) });
    }
    function execEdit(id, ch) {
        const $e = (i) => document.getElementById(i), put = (i, v) => { const el = $e(i); if (el) el.value = v; };
        const rec = allRecords.find(r => r.id === id); if (!rec) return { ok: false, msg: 'رکورد پیدا نشد.' };
        if (!$e('editingRecordId').value && isRecordFormDirty()) return { ok: false, msg: 'فرم «ثبت» نیمه‌پر است؛ ابتدا آن را تکمیل یا خالی کنید.' };
        const snap = JSON.parse(JSON.stringify(rec)), prevTab = appTab, bt = $e('actionFeedbackText'); if (bt) bt.innerText = '';
        editRecord(id);
        if ('itemCode' in ch) put('itemCode', ch.itemCode); if ('itemTitle' in ch) put('itemTitle', ch.itemTitle); if ('itemColor' in ch) put('itemColor', ch.itemColor);
        if ('quantity' in ch) put('receivedQuantity', String(ch.quantity));
        if ('unitPrice' in ch) { const c = $e('priceUnknownCheckbox'); if (c && c.checked) { c.checked = false; togglePriceUnknown(); } put('unitPrice', String(ch.unitPrice)); }
        Object.keys(ch).forEach(k => { if (k.indexOf('cf:') === 0) put('cf_' + k.slice(3), ch[k]); });
        if ('quantity' in ch) runAutoDeliveryCalculation(true);
        handleFormSubmit({ preventDefault() { } });
        try { setAppTab(prevTab, { noScroll: true }); } catch (e) { /* بی‌اهمیت */ }
        const after = allRecords.find(r => r.id === id);
        if (!after || after.updatedAt === snap.updatedAt) { const why = bt ? bt.innerText : ''; try { resetFormState(); } catch (e) { /* بی‌اهمیت */ } return { ok: false, msg: 'ویرایش انجام نشد' + (why ? ': ' + why : '.') }; }
        return { ok: true, msg: 'رکورد ویرایش شد.', rows: recRows(after), undo: () => restoreSnap(snap, 'ویرایش لغو شد.') };
    }

    /* ---------- حذف ---------- */
    function cDelete(raw) {
        const n = norm(raw);
        if (/(یادداشت|یاداوری)/.test(n)) {
            const q = n.replace(/^(حذف|پاک|دلیت)( کن)? ?(آخرین|اخرین|آخر)? ?(یادداشت|یاداوری)/, '').trim(), note = q ? dailyNotes.find(x => norm(x.text).includes(q)) : dailyNotes[0];
            if (!note) return WARN('یادداشتی پیدا نشد.');
            return ask({ title: 'حذف یادداشت', danger: true, ok: 'حذف', warn: 'تا ۳۰ روز در سطل بازیافت می‌ماند.', rows: [['تاریخ', fa(note.date + (note.time ? ' ' + note.time : ''))], ['متن', note.text.slice(0, 120)]], exec: () => delNote(note) });
        }
        const sel = selOf(raw); if (!sel.code && !sel.last && !sel.workerId) return WARN('کدام ثبت حذف شود؟ مثال: «حذف آخرین ثبت» یا «حذف کد ۶۴۴۹».');
        const L = findRecs(sel); if (!L.length) return WARN('رکوردی با این مشخصات پیدا نشد.'); const rec = L[0], snap = JSON.parse(JSON.stringify(rec));
        return ask({
            title: 'حذف رکورد', danger: true, ok: 'حذف', rows: recRows(rec), warn: (L.length > 1 ? 'از ' + fa(f(L.length)) + ' ثبت با این مشخصات، آخرینِ آن‌ها حذف می‌شود. ' : '') + 'تا ۳۰ روز در سطل بازیافت می‌ماند.',
            exec: () => {
                if (!delRec(rec.id)) return { ok: false, msg: 'رکورد پیدا نشد.' };
                return { ok: true, msg: 'رکورد حذف شد.', undo: () => { const r2 = sanitizeRecord(snap); delete tombstones.records[String(r2.id)]; allRecords = allRecords.filter(r => r.id !== r2.id); allRecords.unshift(r2); try { recomputeAllLinks(); } catch (e) { /* بی‌اهمیت */ } try { removeFromTrash(TRASH_RECORDS_STORE, r2.id); } catch (e) { /* بی‌اهمیت */ } saveRecords(); renderDashboard(); return 'رکورد بازگردانده شد.'; } };
            }
        });
    }
    function delNote(note) {
        const snap = JSON.parse(JSON.stringify(note));
        addTombstone('notes', note.id); moveToTrash(TRASH_NOTES_STORE, note); dailyNotes = dailyNotes.filter(x => x.id !== note.id); saveRecords(); renderDailyNotes();
        return { ok: true, msg: 'یادداشت حذف شد.', undo: () => { const n2 = sanitizeNote(snap); delete tombstones.notes[String(n2.id)]; dailyNotes = dailyNotes.filter(x => x.id !== n2.id); dailyNotes.unshift(n2); try { removeFromTrash(TRASH_NOTES_STORE, n2.id); } catch (e) { /* بی‌اهمیت */ } saveRecords(); renderDailyNotes(); return 'یادداشت بازگردانده شد.'; } };
    }

    /* ---------- یادداشت و یادآوری ---------- */
    function cNote(raw) {
        let s = nz(raw).replace(/^\/+\s*/, ''), kind = 'normal', m;
        if ((m = /^\s*(?:به من |بهم |برام )?(یادداشت|یاد ?داشت|یاد ?آوری|یاد ?اوری|یادم بنداز|یادم باشه|نوت|تعطیلی)\s*(?:کن|بکن|بزن|بنویس|بذار|بگذار)?\s*[:\-–]?\s*/.exec(s))) { if (/آوری|اوری|بنداز|باشه/.test(m[1])) kind = 'reminder'; else if (/تعطیلی/.test(m[1])) kind = 'holiday'; s = s.slice(m[0].length); }
        const W = whenOf(s); let text = W.rest.replace(/\s*(کن|بکن|بزن|بنویس)$/, '').replace(/^(که|برای|را|رو)\s+/, '').trim();
        if (kind === 'holiday' && !text) text = 'تعطیلی';
        if (kind === 'normal' && W.time) kind = 'reminder';
        return noteFlow({ kind, text, j: W.j != null ? W.j : todayJ(), time: W.time, repeat: W.repeat });
    }
    function noteFlow(N) {
        const need = !N.text ? 'text' : (N.kind === 'reminder' && !N.time ? 'time' : null);
        if (need) {
            const g = 'g' + (++CMD.seq), cancel = reg(() => { CMD.pend = null; return R([B.p('لغو شد.')]); }, g);
            CMD.pend = { kind: 'slot', ts: Date.now(), cont: (raw) => {
                CMD.pend = null; if (need === 'text') N.text = nz(raw).trim().slice(0, 500); else { const W = whenOf(raw); if (!W.time) { const r = noteFlow(N); r.blocks.unshift(B.note('ساعت معتبر نیست؛ مثل «۹» یا «۱۴:۳۰».', 'warn')); return r; } N.time = W.time; if (W.j != null) N.j = W.j; }
                return noteFlow(N);
            } };
            return R([B.p(need === 'text' ? 'متن یادداشت را بنویسید:' : 'ساعت یادآوری چند باشد؟ (مثلاً ۹ صبح یا ۱۴:۳۰)'), BT([btn('لغو', cancel, 'no')])], []);
        }
        return runPlan({ title: 'ثبت یادداشت', exec: () => execNote(N) });
    }
    function execNote(N) {
        const $e = (i) => document.getElementById(i), put = (i, v) => { const el = $e(i); if (el) el.value = v; };
        if (editingNoteId != null || ($e('noteTextInput') && $e('noteTextInput').value.trim())) return { ok: false, msg: 'فرم یادداشت در حال استفاده است؛ ابتدا آن را تکمیل یا خالی کنید.' };
        const before = new Set(dailyNotes.map(x => x.id)), date = jStr(N.j);
        resetNoteForm(); put('noteDateInput', date); put('noteTypeInput', N.kind); try { onNoteTypeChange(); } catch (e) { /* بی‌اهمیت */ }
        if (N.kind === 'reminder') { put('noteTimeInput', N.time); put('noteRepeatInput', N.repeat || 'none'); } else { put('noteTimeInput', ''); put('noteRepeatInput', 'none'); }
        put('noteTextInput', N.text); saveDailyNote();
        const note = dailyNotes.find(x => !before.has(x.id));
        if (!note) { try { resetNoteForm(); } catch (e) { /* بی‌اهمیت */ } return { ok: false, msg: 'یادداشت ثبت نشد.' }; }
        const rows = [['تاریخ', fa(date)]]; if (note.time) rows.push(['ساعت', fa(note.time)]); if (note.repeat && note.repeat !== 'none') rows.push(['تکرار', { daily: 'روزانه', weekly: 'هفتگی', monthly: 'ماهانه' }[note.repeat]]); rows.push(['متن', note.text.slice(0, 120)]);
        return { ok: true, msg: (N.kind === 'reminder' ? 'یادآوری' : N.kind === 'holiday' ? 'تعطیلی' : 'یادداشت') + ' ثبت شد.', rows, undo: () => { delNote(note); return 'ثبت یادداشت لغو شد.'; } };
    }

    /* ---------- ناوبری، تنظیمات و ابزارها ---------- */
    function cNav(raw) {
        const n = norm(raw), L = [[/(لیست|کارکرد|رکورد|جدول)/, 'list', 'لیست کارکردها'], [/(ثبت|فرم)/, 'add', 'ثبت'], [/یادداشت/, 'notes', 'یادداشت‌ها'], [/(پیشرفت|کار جاری)/, 'progress', 'پیشرفت کار'], [/(کارفرما|پنل)/, 'mgr', 'پنل کارفرما'], [/(خانه|اصلی)/, 'home', 'خانه'], [/تنظیمات/, 'settings', 'تنظیمات'], [/(سطل|بازیافت)/, 'trash', 'سطل بازیافت']];
        const hit = L.find(x => x[0].test(n.replace(/^(برو|ببر|باز کن|بازکن|برگرد) ?(به|توی|تو|در)? ?/, ''))) || L.find(x => x[0].test(n)); if (!hit) return null;
        if (hit[1] === 'mgr' && !mgrIsOn()) return WARN('حالت کارفرما فعال نیست. بگویید «کارفرما روشن کن».');
        aiChatClose();
        setTimeout(() => { if (hit[1] === 'settings') openSettingsModal(); else if (hit[1] === 'trash') openTrashBinModal(); else setAppTab(hit[1]); }, 150);
        return R([B.note('✓ «' + hit[2] + '» باز شد.', 'good')]);
    }
    function cSimple(d, raw) {
        switch (d.t) {
            case 'help': return cHelp();
            case 'undo': { const e = CMD.undo.slice().reverse().find(x => !x.done); return e ? doUndo(e) : WARN('چیزی برای بازگردانی نیست.'); }
            case 'clear': window.aiClear(); return R([B.p('گفتگو پاک شد.')]);
            case 'auto': try { localStorage.setItem(AUTO_KEY, d.on ? '1' : '0'); } catch (e) { /* بی‌اهمیت */ } return R([B.note(d.on ? '✓ اجرای مستقیم روشن شد: ثبت، ویرایش و پایان کار بدون پرسش انجام می‌شوند (حذف همیشه تایید می‌خواهد و بازگردانی ممکن است).' : '✓ از این پس پیش از ثبت، ویرایش و پایان کار تایید گرفته می‌شود.', 'good')]);
            case 'theme': return ask({ title: d.dark ? 'حالت تاریک' : 'حالت روشن', ok: 'اعمال', exec: () => { const old = appSettings.theme || 'light'; const set = (v) => { appSettings.theme = v; persistAppSettings(); applyAppSettingsToUI(); const el = document.getElementById('settingTheme'); if (el) el.value = v; }; set(d.dark ? 'dark' : 'light'); return { ok: true, msg: 'تم تغییر کرد.', undo: () => { set(old); return 'تم قبلی برگشت.'; } }; } });
            case 'mgr': return ask({ title: d.on ? 'روشن کردن حالت کارفرما' : 'خاموش کردن حالت کارفرما', ok: 'تایید', warn: d.on ? null : 'اطلاعات کارفرما حفظ می‌شود.', exec: () => { const old = mgrIsOn(); mgrToggle(d.on); return { ok: true, msg: d.on ? 'حالت کارفرما روشن شد.' : 'حالت کارفرما خاموش شد.', undo: () => { mgrToggle(old); return 'حالت قبلی برگشت.'; } }; } });
            case 'backup': return ask({ title: 'دریافت نسخه‌ی پشتیبان', ok: 'بگیر', exec: () => { exportSmartBackup(); return { ok: true, msg: 'پشتیبان‌گیری اجرا شد.' }; } });
            case 'csv': return ask({ title: d.pay ? 'خروجی CSV حقوق' : 'خروجی CSV کارکردها', ok: 'دانلود', exec: () => { if (d.pay) exportPayrollCSV(); else exportRecordsToCSV(); return { ok: true, msg: 'خروجی آماده‌ی دانلود شد.' }; } });
            case 'print': return ask({ title: 'چاپ لیست کارکردها', ok: 'چاپ', exec: () => { aiChatClose(); setTimeout(() => printRecordsTable(), 250); return { ok: true, msg: 'پنجره‌ی چاپ باز می‌شود.' }; } });
            case 'filter': {
                const inp = document.getElementById('searchInput'); if (!inp) return WARN('کادر جستجوی لیست در دسترس نیست.');
                const q = d.clear ? '' : nz(raw).replace(/^\/+\s*/, '').replace(/^(فیلتر|جستجو|سرچ)( کن| بکن)?( در| توی)? ?(لیست|جدول|کارکرد\S*)?( را| رو)?( روی| بر اساس| با)?/, '').replace(/\s*(کن|بکن)$/, '').trim().replace(/^کد\s+/, '');
                if (!d.clear && !q) return WARN('چه چیزی؟ مثال: «فیلتر لیست کد ۶۴۴۹».');
                const old = inp.value; inp.value = q; debouncedRenderDashboard(); aiChatClose(); setTimeout(() => setAppTab('list'), 150);
                return R([B.note(d.clear ? '✓ فیلتر لیست پاک شد.' : '✓ لیست روی «' + q + '» فیلتر شد.', 'good'), BT([btn('↩ برگرداندن فیلتر', reg(() => { inp.value = old; debouncedRenderDashboard(); return R([B.note('✓ فیلتر قبلی برگشت.', 'good')]); }), 'no')])]);
            }
            case 'worker': {
                if (!mgrIsOn()) return WARN('برای افزودن پرسنل، حالت کارفرما باید روشن باشد («کارفرما روشن کن»).');
                const name = nz(raw).replace(/^\/+\s*/, '').replace(/^(افزودن|اضافه|ثبت|ایجاد)( کن)? ?(پرسنل|کارگر|کارمند)( جدید)? ?/, '').replace(/^(پرسنل|کارگر|کارمند) جدید ?/, '').replace(/\s*(کن|بکن)$/, '').trim().slice(0, 100);
                if (!name) return WARN('نام پرسنل را هم بنویسید. مثال: «پرسنل جدید علی احمدی».');
                if (mgr().workers.some(w => normalizeSearchText(w.name) === normalizeSearchText(name))) return WARN('پرسنلی با این نام قبلاً ثبت شده است.');
                return ask({ title: 'افزودن پرسنل', ok: 'تایید و افزودن', rows: [['نام', name]], exec: () => { mgrPullIfStale(true); const w = { id: mgrId('w'), active: true, name, phone: '', sectionId: '', role: '', startDate: mgrDK(''), endDate: mgrDK(''), note: '', photo: null }; mgr().workers.push(w); mgrSave(); try { applyManagerToUI(); mgrRender(); } catch (e) { /* بی‌اهمیت */ } renderDashboard(); return { ok: true, msg: 'پرسنل «' + name + '» اضافه شد.', undo: () => { mgr().workers = mgr().workers.filter(x => x.id !== w.id); mgrSave(); try { applyManagerToUI(); mgrRender(); } catch (e) { /* بی‌اهمیت */ } renderDashboard(); return 'پرسنل حذف شد.'; } }; } });
            }
            case 'wtoggle': {
                if (!mgrIsOn()) return WARN('حالت کارفرما روشن نیست.');
                const nm = nz(raw).replace(/^(غیرفعال|فعال) (کن )?(پرسنل|کارگر|کارمند) ?/, '').replace(/\s*(کن|بکن)$/, '').trim();
                const L = mgr().workers.filter(w => normalizeSearchText(w.name).includes(normalizeSearchText(nm))); if (!nm || L.length !== 1) return WARN(!nm ? 'نام پرسنل را بنویسید.' : (L.length ? 'چند پرسنل با این نام هست؛ نام کامل‌تر بنویسید.' : 'پرسنلی با این نام پیدا نشد.'));
                const w = L[0]; return ask({ title: d.on ? 'فعال‌سازی پرسنل' : 'غیرفعال‌سازی پرسنل', ok: 'تایید', rows: [['نام', w.name]], exec: () => { const old = w.active; w.active = d.on; mgrSave(); try { mgrRender(); } catch (e) { /* بی‌اهمیت */ } return { ok: true, msg: 'انجام شد.', undo: () => { w.active = old; mgrSave(); try { mgrRender(); } catch (e) { /* بی‌اهمیت */ } return 'وضعیت قبلی برگشت.'; } }; } });
            }
        }
        return null;
    }
    function cHelp() {
        return R([B.h('دستورهای چت'), B.p('هر دستور را محاوره‌ای بنویسید؛ فیلدها هر ترتیبی می‌توانند داشته باشند. اگر چیزی کم باشد می‌پرسم و پیش از اجرا تایید می‌گیرم (با «تایید خودکار روشن» بدون پرسش). با «/» فهرست دستورها باز می‌شود.'),
            B.table(['دسته', 'نمونه'], [['ثبت', 'ثبت کد ۶۴۴۹ تعداد ۵۰ قیمت ۱۲ هزار عنوان پیراهن رنگ آبی'], ['پایان کار', 'پایان کار · پایان کار کد ۶۴۴۹ · پایان کار ساعت ۱۴:۳۰'], ['ویرایش', 'قیمت کد ۶۴۴۹ را ۱۵ هزار کن · تعداد آخرین ثبت را ۶۰ کن'], ['حذف', 'حذف آخرین ثبت · حذف کد ۶۴۴۹ · حذف آخرین یادداشت'], ['یادداشت', 'یادداشت فردا: خرید نخ · یادآوری فردا ساعت ۹ تماس با مشتری · یادآوری هر هفته ...'], ['رفتن به', 'برو به لیست / ثبت / یادداشت‌ها / پیشرفت / تنظیمات / سطل بازیافت'], ['لیست', 'فیلتر لیست کد ۶۴۴۹ · پاک کردن فیلتر · چاپ لیست · خروجی CSV'], ['برنامه', 'حالت تاریک · پشتیبان بگیر · کارفرما روشن کن'], ['پرسنل', 'پرسنل جدید علی · ثبت کد ۱۲ تعداد ۵ قیمت ۱۰۰۰ برای علی'], ['کنترل', 'بازگردانی · تایید خودکار روشن/خاموش · چند دستور پشت هم با «؛» یا «سپس»']]),
            B.note('پرسش‌های تحلیلی (مثل «درآمد امروز») همچنان مثل قبل کار می‌کنند.')], ['ثبت کد', 'پایان کار', 'بازگردانی']);
    }

    /* ---------- اجرا ---------- */
    function dispatch(d, raw) {
        switch (d.t) {
            case 'create': return cCreate(raw); case 'finish': return cFinish(raw); case 'edit': return cEdit(raw);
            case 'delete': return cDelete(raw); case 'note': return cNote(raw); case 'nav': return cNav(raw);
            default: return cSimple(d, raw);
        }
    }
    function batch(parts) {
        if (parts.some(x => detect(x).t === 'delete')) return WARN('حذف را جداگانه بفرستید تا تایید بگیرم.');
        const bl = [], old = CMD.forceAuto; CMD.forceAuto = true;
        try { for (let i = 0; i < parts.length; i++) { const r = dispatch(detect(parts[i]), parts[i]); bl.push(B.note('▸ ' + parts[i])); if (r) r.blocks.forEach(b => bl.push(b)); if (CMD.pend && i < parts.length - 1) { bl.push(B.note('ادامه‌ی دستورها اجرا نشد؛ پس از پاسخ به پرسش بالا دوباره بفرستید.', 'warn')); break; } } }
        finally { CMD.forceAuto = old; }
        return R(bl, []);
    }
    function cmdRun(raw) {
        const n = norm(raw); if (CMD.pend && Date.now() - CMD.pend.ts > 180000) CMD.pend = null;
        const P = CMD.pend;
        if (P) {
            if (P.kind === 'confirm') { if (YES.test(n)) return useAct(P.yes); if (NO.test(n)) return useAct(P.no); CMD.pend = null; }
            else if (P.kind === 'slot') { if (NO.test(n)) { CMD.pend = null; return R([B.p('لغو شد.')]); } if (!detect(raw)) return P.cont(raw); CMD.pend = null; }
        }
        const parts = String(raw).split(/\s*(?:؛|;|\n|\sسپس\s|\sبعدش\s|\sبعد از آن\s)\s*/).filter(Boolean);
        if (parts.length > 1 && parts.every(x => detect(x))) return batch(parts);
        const d = detect(raw); return d ? dispatch(d, raw) : null;
    }
    window.aiCmdIs = function (q) { try { return !!(CMD.pend || detect(String(q || '').split(/\s*[؛;\n]\s*/)[0])); } catch (e) { return false; } };
    window.aiCmdBtn = function (id) {
        const a = CMD.acts[id]; if (!a || a.used) return; let r;
        try { r = useAct(id); } catch (e) { r = WARN('اجرای دستور با خطا مواجه شد.'); }
        if (r) { history.push({ q: '', blocks: r.blocks, chips: r.chips || [], pending: false }); while (history.length > 8) history.shift(); }
        renderChat();
    };
    window.aiCmdFill = function (q) { const inp = $('aiInput'); if (!inp) return; inp.value = q; hideSuggest(); try { inp.focus(); inp.setSelectionRange(q.length, q.length); } catch (e) { /* بی‌اهمیت */ } };


    /* ============================ رابط کاربری ============================ */
    const TONE = {
        info: 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700',
        good: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900',
        warn: 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900'
    };
    const TXT = { info: 'text-slate-500 dark:text-slate-400', good: 'text-emerald-600 dark:text-emerald-400', warn: 'text-amber-600 dark:text-amber-400' };
    const FILL = { info: '#6366f1', good: '#10b981', warn: '#f59e0b' };
    function spark(vals, labels, hi) {
        const n = vals.length, W = 300, H = 56, bw = W / n, mx = Math.max.apply(null, vals.concat([1])), mn = Math.min.apply(null, vals.concat([0]));
        let s = `<svg viewBox="0 0 ${W} ${H}" class="w-full h-14 my-1" preserveAspectRatio="none" role="img" aria-label="نمودار">`;
        vals.forEach((v, i) => { const h = Math.max(2, (v - mn) / ((mx - mn) || 1) * (H - 6)), x = W - (i + 1) * bw; s += `<rect x="${(x + bw * 0.15).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" style="fill:${i === hi ? '#4f46e5' : '#a5b4fc'}"><title>${esc((labels[i] || '') + ': ' + f(v))}</title></rect>`; });
        return s + '</svg>';
    }
    function renderBlock(b) {
        switch (b.k) {
            case 'h': return `<div class="text-[12px] font-extrabold text-slate-800 dark:text-slate-100 mb-1.5">${md(b.t)}</div>`;
            case 'p': return `<div class="text-[12px] leading-relaxed mb-1.5">${md(b.t)}</div>`;
            case 'note': return `<div class="text-[11px] leading-relaxed mb-1.5 ${TXT[b.tone || 'info']}">${md(b.t)}</div>`;
            case 'big': return `<div class="rounded-xl border px-3 py-2 mb-2 ${TONE[b.tone || 'info']}"><div class="text-[10.5px] opacity-80">${md(b.label)}</div><div class="text-[17px] font-extrabold leading-snug">${md(b.value)}</div>${b.sub ? `<div class="text-[10.5px] opacity-80 mt-0.5">${md(b.sub)}</div>` : ''}</div>`;
            case 'kv': return `<div class="mb-2 divide-y divide-slate-200/70 dark:divide-slate-700/70">${b.rows.map(r => `<div class="flex items-start justify-between gap-3 py-1 text-[11.5px]"><span class="text-slate-500 dark:text-slate-400">${md(r[0])}</span><b class="text-left">${md(r[1])}</b></div>`).join('')}</div>`;
            case 'bars': return `<div class="mb-2">${b.rows.map(r => `<div class="mb-1.5"><div class="flex items-center justify-between gap-2 text-[11px]"><span class="truncate${r.hi ? ' font-extrabold' : ''}">${esc(r.l)}</span><b class="shrink-0">${esc(r.t)}</b></div><div class="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-0.5"><div class="h-full rounded-full" style="width:${r.w.toFixed(1)}%;background:${r.hi ? '#4f46e5' : '#818cf8'}"></div></div></div>`).join('')}</div>`;
            case 'table': return `<div class="overflow-x-auto mb-2 rounded-lg border border-slate-200 dark:border-slate-700"><table class="w-full text-[11px] text-right"><thead class="bg-slate-100 dark:bg-slate-800"><tr>${b.head.map(h => `<th class="px-2 py-1 font-bold whitespace-nowrap">${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr class="border-t border-slate-200 dark:border-slate-700">${r.map((c, i) => { const o = (c && typeof c === 'object') ? c : { t: c }; return `<td class="px-2 py-1 ${i === 0 ? 'font-semibold' : 'whitespace-nowrap'} ${o.tone ? TXT[o.tone] + ' font-bold' : ''}">${esc(o.t)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
            case 'list': return `<ul class="mb-2 space-y-0.5 text-[11.5px]">${b.items.map(i => `<li class="flex gap-1.5"><span class="text-indigo-400">•</span><span>${md(i)}</span></li>`).join('')}</ul>`;
            case 'spark': return `<div class="mb-1.5 rounded-lg bg-white/60 dark:bg-slate-900/40 px-1">${spark(b.vals, b.labels, b.hi)}<div class="flex justify-between text-[9.5px] text-slate-400 px-1"><span>${esc(b.labels[b.labels.length - 1] || '')}</span><span>${esc(b.labels[0] || '')}</span></div></div>`;
            case 'prog': return `<div class="mb-2"><div class="flex justify-between text-[11px] mb-0.5"><span>${esc(b.label)}</span><span class="${TXT[b.tone || 'info']} font-bold">${esc(b.right || '')}</span></div><div class="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div class="h-full rounded-full" style="width:${Math.max(1, Math.min(100, b.pct)).toFixed(1)}%;background:${FILL[b.tone || 'info']}"></div></div></div>`;
            case 'finds': return `<div class="space-y-1.5 mb-2">${b.items.map(o => `<div class="flex items-start gap-2 rounded-xl border px-2.5 py-1.5 text-[11.5px] leading-relaxed ${TONE[o.t] || TONE.info}"><i class="fa-solid ${esc(o.i || 'fa-circle-info')} mt-0.5 text-[10px] opacity-80"></i><span>${esc(o.x)}</span></div>`).join('')}</div>`;
        }
        return '';
    }
    const CHIP = 'tactile-btn shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/30';
    const history = [];
    function renderChat() {
        const a = $('aiAnswer'); if (!a) return;
        if (!history.length) { a.classList.add('hidden'); a.innerHTML = ''; return; }
        a.classList.remove('hidden');
        const lastIdx = history.length - 1;
        a.innerHTML = '<div class="flex justify-end mb-1"><button type="button" onclick="aiClear()" class="text-[10px] text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can ml-1"></i>پاک کردن گفتگو</button></div>'
            + history.map((h, i) => (h.q ? `<div class="flex justify-start mb-1.5"><div class="max-w-[90%] rounded-2xl rounded-tr-sm bg-indigo-600 text-white px-3 py-1.5 text-[12px]">${esc(h.q)}</div></div>` : '')
                + (h.pending ? '<div class="mb-2.5 rounded-2xl rounded-tl-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-400 text-[12px]"><i class="fa-solid fa-ellipsis fa-fade"></i> در حال تحلیل…</div>'
                    : `<div class="mb-2.5 rounded-2xl rounded-tl-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 relative">${h.blocks.map(renderBlock).join('')}<button type="button" onclick="aiCopy(${i})" title="کپی پاسخ" aria-label="کپی پاسخ" class="absolute top-1.5 left-1.5 w-6 h-6 rounded-md text-slate-300 hover:text-indigo-500 flex items-center justify-center"><i class="fa-regular fa-copy text-[10px]"></i></button>${(i === lastIdx && h.chips && h.chips.length) ? `<div class="flex flex-wrap gap-1.5 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">${h.chips.map(c => `<button type="button" data-q="${esc(c)}" onclick="aiAskText(this.dataset.q)" class="${CHIP}">${esc(c)}</button>`).join('')}</div>` : ''}</div>`)).join('');
        if (a.lastElementChild && a.lastElementChild.scrollIntoView) a.lastElementChild.scrollIntoView({ block: 'nearest' });
    }
    function submit(q) {
        q = String(q || '').trim(); if (!q) return; CMD.hist.push(q); if (CMD.hist.length > 30) CMD.hist.shift(); CMD.hi = -1;
        let isC = false; try { isC = !!(CMD.pend || detect(q)); } catch (x) { isC = false; } if (!isC) freqAdd(q);
        const e = { q, pending: true, blocks: [], chips: [] }; history.push(e); while (history.length > 8) history.shift(); renderChat();
        setTimeout(() => { let r = null; try { r = cmdRun(q); } catch (x) { try { console.warn('[AI-CMD]', x); } catch (z) { /* بی‌اهمیت */ } r = R([B.note('اجرای دستور با خطا مواجه شد؛ تغییری اعمال نشد.', 'warn')]); } if (!r) r = answer(q); e.blocks = r.blocks; e.chips = r.chips; e.pending = false; renderChat(); }, 160);
    }
    window.aiAsk = function () { const inp = $('aiInput'); if (!inp) return; const q = inp.value.trim(); if (!q) return; inp.value = ''; hideSuggest(); submit(q); };
    window.aiAskText = function (t) { const inp = $('aiInput'); if (inp) inp.value = ''; hideSuggest(); submit(t); };
    window.aiClear = function () { history.length = 0; ctx.plan = null; renderChat(); };
    window.aiAnswerText = function (q) { return toPlain(answer(String(q || '')).blocks); };
    window.aiForgetFrequent = function () { try { localStorage.removeItem(FKEY); } catch (e) { /* بی‌اهمیت */ } buildChips(); };
    window.aiCopy = function (i) { const h = history[i]; if (!h) return; const t = toPlain(h.blocks); try { navigator.clipboard.writeText(t); } catch (e) { /* در دسترس نیست */ } };
    const KIND = { summary: 'خلاصه‌ی این ماه', today: 'امروز', week: 'این هفته', compare: 'مقایسه با ماه قبل', forecast: 'پیش‌بینی پایان ماه', late: 'کارهای با تاخیر', active: 'کار جاری', top: 'برترین کدها', avg: 'میانگین‌ها', hours: 'ساعت‌های پرکار', tips: 'پیشنهادها', workers: 'پرسنل', help: 'راهنما' };
    window.aiChip = function (kind) { const t = KIND[kind]; if (t) submit(t); };
    window.aiRenderInsights = function (manual) { render(); buildChips(); if (manual) window.aiClear(); };

    function render() {
        const el = $('aiInsights'); if (!el) return;
        let list = [];
        try { list = insights(build()); } catch (e) { list = [{ i: 'fa-circle-info', t: 'info', x: 'تحلیل در دسترس نیست.' }]; }
        el.innerHTML = list.map(o => `<div class="flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed ${TONE[o.t]}"><i class="fa-solid ${o.i} mt-0.5 text-[11px] opacity-80"></i><span>${esc(o.x)}</span></div>`).join('');
        const sub = $('aiSub'); if (sub) sub.textContent = 'تحلیل آفلاین روی همین دستگاه';
    }
    function buildChips() {
        const el = $('aiChips'); if (!el) return;
        let S = null; try { S = build(); } catch (e) { /* بدون هوشمندسازی */ }
        const c = [];
        if (S) {
            if (S.act && S.prog && S.prog.remainingMinutes < 0) c.push('کار جاری');
            if (S.goal > 0 && S.m.length) c.push('برای رسیدن به هدف چه کنم؟');
            if (S.p.length && S.day <= 10) c.push('مقایسه با ماه قبل');
        }
        freqTop(3).forEach(x => c.push(x));
        ['تحلیل هوشمند', 'امروز', 'این هفته', 'درآمد هر روز این ماه', 'پیش‌بینی پایان ماه', 'برترین کدها', 'کدام کد بازده ساعتی بهتری دارد؟', 'کارهای با تاخیر', 'کدام روز هفته پرکارتر است؟', 'روزهای غیرعادی', 'روزهای بدون کار'].forEach(x => c.push(x));
        if (S && S.emp) c.push('کی بیکاره؟', 'عملکرد پرسنل');
        c.push('دستورها', 'راهنما');
        el.innerHTML = uniq(c).slice(0, 14).map(x => `<button type="button" data-q="${esc(x)}" onclick="aiAskText(this.dataset.q)" class="${CHIP}">${esc(x)}</button>`).join('');
    }

    /* پیشنهاد هنگام تایپ */
    function hideSuggest() { const s = $('aiSuggest'); if (s) { s.classList.add('hidden'); s.innerHTML = ''; } }
    let typeTm = null;
    function onTypeSoon() { clearTimeout(typeTm); typeTm = setTimeout(onType, 180); }
    function onType() {
        const inp = $('aiInput'), box = $('aiSuggest'); if (!inp || !box) return;
        if (/^\//.test(inp.value)) { const k = norm(inp.value.replace(/^\/+/, '')), L = CMD_TPL.filter(x => !k || norm(x).indexOf(k) >= 0).slice(0, 7); if (!L.length) { hideSuggest(); return; } box.innerHTML = L.map(x => `<button type="button" data-q="${esc(x)}" onclick="aiCmdFill(this.dataset.q)" class="block w-full text-right px-3 py-1.5 text-[11.5px] hover:bg-indigo-50 dark:hover:bg-slate-800">/ ${esc(x)}</button>`).join(''); box.classList.remove('hidden'); return; }
        const t = norm(inp.value); if (t.length < 2) { hideSuggest(); return; }
        let S = null; try { S = build(); } catch (e) { return; }
        const pool = CATALOG.filter(c => !c[2] || S.emp).map(c => c[1]);
        const codes = (S.__codes || (S.__codes = uniq(S.recs.map(x => x.codeRaw)).filter(Boolean).slice(0, 400))); codes.forEach(c => pool.push('کد ' + c));
        S.workers.forEach(w => { if (w && w.name) { pool.push('عملکرد ' + w.name + ' این ماه'); pool.push('درآمد ' + w.name + ' هفته قبل'); } });
        freqTop(20).forEach(x => pool.push(x));
        const tk = t.split(' ').map(stem).filter(Boolean);
        const sc = pool.map(p => { const pn = ' ' + norm(p).split(' ').map(stem).join(' '); let s = 0; tk.forEach(w => { if (pn.indexOf(' ' + w) >= 0) s += 2; else if (pn.indexOf(w) >= 0) s += 1; else s -= 3; }); return { p, s }; }).filter(z => z.s > 0).sort((a, b) => b.s - a.s).slice(0, 4);
        if (!sc.length) { hideSuggest(); return; }
        box.innerHTML = sc.map(z => `<button type="button" data-q="${esc(z.p)}" onclick="aiAskText(this.dataset.q)" class="block w-full text-right px-3 py-1.5 text-[11.5px] hover:bg-indigo-50 dark:hover:bg-slate-800">${esc(z.p)}</button>`).join('');
        box.classList.remove('hidden');
    }

    let tmr = null; const idle = (fn) => { try { (window.requestIdleCallback || setTimeout)(fn, window.requestIdleCallback ? { timeout: 2500 } : 300); } catch (e) { setTimeout(fn, 300); } };
    const later = () => { clearTimeout(tmr); tmr = setTimeout(() => idle(render), 900); };
    window.addEventListener('load', function () {
        ['renderDashboard'].forEach(n => { const o = window[n]; if (typeof o === 'function') window[n] = function () { const r = o.apply(this, arguments); later(); return r; }; });
        const inp = $('aiInput'); if (inp) { inp.addEventListener('keydown', (ev) => { if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && CMD.hist.length && (!inp.value || CMD.hi >= 0)) { ev.preventDefault(); CMD.hi = ev.key === 'ArrowUp' ? Math.min(CMD.hist.length - 1, CMD.hi + 1) : CMD.hi - 1; inp.value = CMD.hi >= 0 ? CMD.hist[CMD.hist.length - 1 - CMD.hi] : ''; } });
            inp.addEventListener('input', onTypeSoon); inp.addEventListener('blur', () => setTimeout(hideSuggest, 200)); }
        /* تحلیل اولیه بعد از بالا آمدن برنامه و در زمان بیکاری انجام می‌شود تا باز شدن برنامه کند نشود */
        setTimeout(() => idle(() => { render(); buildChips(); }), 1500);
    });
})();
