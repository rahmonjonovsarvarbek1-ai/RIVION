import { db } from "./firebase-config.js"; // firebase sozlangan faylingga yo'l
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

async function yangiElonBerish(title, rasmUrl) {
    try {
        await addDoc(collection(db, "news"), {
            title: title,
            imageURL: rasmUrl,
            date: new Date().toLocaleDateString("en-GB"), // 11/04/2026 ko'rinishi
            createdAt: serverTimestamp() // Tartiblash uchun
        });
        console.log("E'lon muvaffaqiyatli qo'shildi!");
    } catch (error) {
        console.error("Xatolik:", error);
    }
}

// HAR KUNI SHU YERNI O'ZGARTIRASIZ:
yangiElonBerish("RIVION yangiligi: Bugun yangi interfeys qo'shildi!", "assets/images/news-1.jpg");

async function haqiqiyElonBerish() {
    try {
        // Ma'lumotni bazaga yuborish
        await addDoc(collection(db, "news"), {
            title: "Eron va AQSH o‘rtasida sulh muzokaralari: Islomobodda muhim uchrashuv",
            text: "Al Jazeera xabariga ko‘ra, Eron rasmiy delegatsiyasi sulh masalalarini muhokama qilish uchun Pokiston poytaxtiga yetib keldi. Eron parlamenti spikeri Muhammad Baqer Ghalibaf va Tashqi ishlar vaziri Abbos Araqchi boshchiligidagi delegatsiya AQSH vitse-prezidenti Jey Di Vens bilan muzokaralar olib boradi.",
            imageURL: "https://static.euronews.com/articles/stories/08/91/36/44/1200x675_cmsv2_f83e20e8-077f-5d6e-9c5e-0f0e0f0f0f0f.jpg",
            date: "11/04/2026",
            createdAt: serverTimestamp()
        });
        
        console.log("Bazaga yozildi!");
        alert("Xabar muvaffaqiyatli qo'shildi! Sahifani yangilang.");
    } catch (e) {
        console.error("Xatolik chiqdi: ", e);
        alert("Xatolik: " + e.message);
    }
}

// Funksiyani chaqirish
haqiqiyElonBerish();