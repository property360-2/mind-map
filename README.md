# 🧠 Mind Map Generator (Local Server Version)

Yo bro! Ito ang main workspace mo para sa **Pagawaan ng Mind Map**. Ang version na ito ay gumagamit ng **Node.js backend** para siguradong naka-save ang lahat ng maps mo bilang JSON files sa computer mo mismo.

## 🚀 Paano I-run Locally?

1.  **Buksan ang Terminal** sa folder na ito.
2.  **I-install ang dependencies** (isang beses lang ito):
    ```powershell
    npm install
    ```
3.  **I-start ang server**:
    ```powershell
    node server.js
    ```
4.  **Buksan sa Browser**:
    Punta ka sa [http://localhost:3000](http://localhost:3000)

---

## ✨ Mga Features (Main Branch)

-   **File-based Saving**: Lahat ng maps ay sinesave sa `/maps` folder (JSON format).
-   **Autosave**: Kahit anong edit mo, sinesave agad ng server.
-   **Infinite Canvas**: Zoom in/out (CTRL + Mouse Wheel) at Pan (Drag canvas).
-   **Export Image**: Pwede mong i-download as PNG yung mind map mo (kasama pati mga comments!).
-   **Archive/Restore**: Pwede kang mag-linis ng listahan mo nang hindi nabubura ang files.
-   **Drag and Drop**: Re-parenting ng nodes sa pamamagitan ng pag-drag lang.

---

## 📂 Project Structure

-   `/public`: Dito nakalagay ang frontend code (`index.html`, `app.js`, `style.css`).
-   `/maps`: Dito ini-imbak ng server ang mga mind map data files.
-   `server.js`: Ang Node.js Express server na kumokontrol sa pag-save at pag-load.

---

## 🌿 Branches

-   `main`: (Ito yun!) Ang version na may backend. Pinaka-safe for local production.
-   `demo-preview`: Ang version na gawa para sa **GitHub Pages**. Gumagamit ito ng `localStorage` imbes na server.

---

**Happy Mind Mapping, bro!** 🧠🔥
