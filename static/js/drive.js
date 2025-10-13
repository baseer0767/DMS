/*================= GOOGLE AUTH & DRIVE =================
const CLIENT_ID = "246107059333-ouui971jmj2avu0bvfc2al6u3ql2aj0l.apps.googleusercontent.com";
const API_KEY = "AIzaSyBRiEHyLj68UIm2Nt4NmWg62QnOyJ_EunQ";
const SCOPES =
    "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.profile";
const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";

// ================= GLOBAL FUNCTIONS =================
// Called from unified button in index.html
window.handleDriveJsLogic = async function () {
    try {
        // Request OAuth token if needed
        if (!tokenClient) {
            console.error("❌ Token client is not initialized yet.");
            return;
        }

        tokenClient.callback = async (resp) => {
            if (resp.error) throw resp;

            // Fetch and send files to backend
            await listFiles();
        };

        if (gapi.client.getToken() === null) {
            console.log("⚡ Requesting token with consent...");
            tokenClient.requestAccessToken({ prompt: "consent" });
        } else {
            console.log("⚡ Requesting token silently...");
            tokenClient.requestAccessToken({ prompt: "" });
        }
    } catch (err) {
        console.error("❌ Error in handleDriveJsLogic:", err);
    }
};

// ================= INITIALIZATION =================
function gapiLoaded() {
    console.log("📥 GAPI script loaded. Initializing client...");
    gapi.load("client", initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    console.log("✅ GAPI client initialized.");
}

function gisLoaded() {
    console.log("📥 GIS script loaded. Initializing token client...");
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.error) {
                console.error("❌ Google Auth error:", resp);
                return;
            }
            // Actual callback logic is handled in handleDriveJsLogic
        },
    });
    gisInited = true;
    console.log("✅ Token client initialized.");
}

// ================= DRIVE FETCH & UPLOAD LOGIC =================
async function listFiles() {
    try {
        console.log("📂 Fetching files from Google Drive...");

        const response = await gapi.client.drive.files.list({
            pageSize: 1000,
            fields: "files(id, name, mimeType, size, parents, createdTime, webViewLink)",
        });

        const files = response.result.files || [];
        if (!files.length) {
            console.warn("⚠️ No files found in Drive.");
            return;
        }

        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        // Step 1: Save folders first
        for (const file of files) {
            if (file.mimeType === "application/vnd.google-apps.folder") {
                console.log("📁 Sending folder:", file.name);
                await sendToBackend(file);
            }
        }

        await sleep(2000);

        // Step 2: Save files
        for (const file of files) {
            if (file.mimeType !== "application/vnd.google-apps.folder") {
                console.log("📄 Sending file:", file.name);
                await sendToBackend(file);
            }
        }

        console.log("✅ All files uploaded to backend.");
    } catch (err) {
        console.error("❌ Error fetching files:", err.message);
    }
}

async function sendToBackend(file) {
    const payload = {
        file_id: file.id,
        title: file.name,
        file_type: file.mimeType,
        file_size: file.size || 0,
        folder_id: file.parents ? file.parents[0] : null,
        uploaded_by: 1,
        upload_date: file.createdTime,
        file_url: file.webViewLink,
        tags: "",
    };

    console.log("⬆️ Sending to backend:", payload.title);

    await fetch("http://localhost:8000/upload-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

// Expose loaders for gapi/gis
window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;*/
