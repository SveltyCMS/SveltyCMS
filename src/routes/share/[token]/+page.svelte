<!-- 
@file src/routes/share/[token]/+page.svelte
@component
**Premium public share landing page with password protection support and file download**

### Features:
- Glassmorphism dark-mode UI
- Dynamic download button
- Cryptographic password protection verification
- Performance-focused responsive layout
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
  import { formatBytes } from "@utils/utils";
  import { toast } from "@src/stores/toast.svelte.ts";

  let { data } = $props();

  let password = $state("");
  let isVerifying = $state(false);
  let passwordError = $state(false);
  let isDownloading = $state(false);

  // Helper to format file types
  function formatMime(mime?: string) {
    if (!mime) return "FILE";
    return mime.split("/")[1]?.toUpperCase() || mime.toUpperCase();
  }

  function getFileIcon(type?: string) {
    switch (type) {
      case "image": return "mdi:image-outline";
      case "video": return "mdi:video-outline";
      case "audio": return "mdi:music-note";
      default: return "mdi:file-document-outline";
    }
  }

  function handleDownloadClick(e: MouseEvent) {
    if (data.passwordRequired && !password) {
      toast.error("Please enter the password to download this file.");
      e.preventDefault();
      return;
    }
    isDownloading = true;
    setTimeout(() => {
      isDownloading = false;
    }, 3000);
  }

  async function handleVerifyPassword(e: SubmitEvent) {
    e.preventDefault();
    if (!password) return;

    isVerifying = true;
    passwordError = false;

    try {
      // Test the password against the download API endpoint
      const res = await fetch(`/api/media/share?id=${data.mediaId}&token=${data.token}&password=${encodeURIComponent(password)}`);
      
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && body.passwordRequired) {
          passwordError = true;
          toast.error("Incorrect password. Please try again.");
        } else {
          // Password is correct, let's trigger the download!
          toast.success("Password verified! Starting download...");
          const downloadUrl = `/api/media/share?id=${data.mediaId}&token=${data.token}&password=${encodeURIComponent(password)}`;
          window.location.href = downloadUrl;
        }
      } else {
        passwordError = true;
        toast.error("Verification failed.");
      }
    } catch (err) {
      toast.error("An error occurred during verification.");
    } finally {
      isVerifying = false;
    }
  }
</script>

<svelte:head>
  <title>Share: {data.filename} - SveltyCMS</title>
  <meta name="description" content="Download shared file from SveltyCMS" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="share-page-container">
  <div class="background-glows">
    <div class="glow glow-1"></div>
    <div class="glow glow-2"></div>
  </div>

  <div class="card-wrapper animate-fade-in">
    <div class="logo-area">
      <span class="logo-text">SVELTY<span class="accent">CMS</span></span>
    </div>

    <div class="file-card">
      <div class="icon-glow-wrapper">
        <div class="file-icon-box">
          <iconify-icon icon={getFileIcon(data.type)} width="48"></iconify-icon>
        </div>
      </div>

      <h1 class="file-title" title={data.filename}>{data.filename}</h1>
      
      <div class="file-meta">
        <span class="meta-tag">{formatMime(data.mimeType)}</span>
        <span class="meta-separator">•</span>
        <span class="meta-size">{formatBytes(data.size)}</span>
      </div>

      {#if data.passwordRequired}
        <form onsubmit={handleVerifyPassword} class="password-form">
          <p class="form-instruction">This shared file is password protected.</p>
          
          <div class="input-wrapper">
            <iconify-icon icon="mdi:lock-outline" class="input-icon" width="20"></iconify-icon>
            <input 
              type="password" 
              bind:value={password}
              placeholder="Enter password..." 
              class="password-input {passwordError ? 'error' : ''}"
              required
              aria-label="File password"
            />
          </div>

          <Button variant="outline" 
            type="submit"
            disabled={isVerifying}
           class="download- glow-effect">
            {#if isVerifying}
              <iconify-icon icon="mdi:loading" class="animate-spin" width="20"></iconify-icon>
              <span>Verifying...</span>
            {:else}
              <iconify-icon icon="mdi:key-outline" width="20"></iconify-icon>
              <span>Unlock & Download</span>
            {/if}
          </Button>
        </form>
      {:else}
        <div class="download-action-area">
          <p class="form-instruction">Click the button below to download the file directly.</p>
          
          <Button
            href="/api/media/share?id={data.mediaId}&token={data.token}"
            onclick={handleDownloadClick}
            class="glow-effect download-link w-full !rounded-xl !bg-gradient-to-br !from-blue-500 !to-blue-600 !py-3.5 !px-6 !font-semibold !text-white !shadow-[0_10px_15px_-3px_rgba(37,99,235,0.3)] hover:!-translate-y-0.5 hover:!shadow-[0_15px_20px_-3px_rgba(37,99,235,0.4)] active:!translate-y-0 disabled:!cursor-not-allowed disabled:!opacity-60 disabled:hover:!translate-y-0"
            download={data.filename}
            disabled={isDownloading}
          >
            {#if isDownloading}
              <iconify-icon icon="mdi:loading" class="animate-spin" width="20"></iconify-icon>
              <span>Downloading...</span>
            {:else}
              <iconify-icon icon="mdi:download-outline" width="20"></iconify-icon>
              <span>Download File</span>
            {/if}
          </Button>
        </div>
      {/if}
    </div>

    <div class="footer-note">
      Secured by SveltyCMS high-performance asset engine.
    </div>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #0b0f19;
    color: #f1f5f9;
    font-family: 'Outfit', sans-serif;
  }

  .share-page-container {
    display: flex;
    min-height: 100vh;
    width: 100vw;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    padding: 2rem;
    box-sizing: border-box;
  }

  .background-glows {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  .glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(120px);
    opacity: 0.15;
  }

  .glow-1 {
    top: 20%;
    left: 25%;
    width: 300px;
    height: 300px;
    background: #3b82f6;
  }

  .glow-2 {
    bottom: 25%;
    right: 25%;
    width: 350px;
    height: 350px;
    background: #a855f7;
  }

  .card-wrapper {
    position: relative;
    z-index: 10;
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }

  .logo-area {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    opacity: 0.8;
  }

  .accent {
    color: #3b82f6;
  }

  .file-card {
    width: 100%;
    background: rgba(17, 24, 39, 0.6);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 24px;
    padding: 3rem 2.5rem;
    box-sizing: border-box;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .icon-glow-wrapper {
    position: relative;
    margin-bottom: 1.5rem;
  }

  .icon-glow-wrapper::after {
    content: '';
    position: absolute;
    inset: -5px;
    background: linear-gradient(135deg, #3b82f6, #a855f7);
    border-radius: 20px;
    filter: blur(8px);
    opacity: 0.4;
    z-index: -1;
  }

  .file-icon-box {
    width: 80px;
    height: 80px;
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #3b82f6;
  }

  .file-title {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
    color: #f8fafc;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: #94a3b8;
    margin-bottom: 2.5rem;
  }

  .meta-tag {
    background: rgba(59, 130, 246, 0.1);
    color: #60a5fa;
    padding: 0.25rem 0.625rem;
    border-radius: 9999px;
    font-weight: 600;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
  }

  .meta-separator {
    opacity: 0.3;
  }

  .form-instruction {
    font-size: 0.925rem;
    color: #94a3b8;
    margin-bottom: 1.25rem;
  }

  .password-form, .download-action-area {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .input-wrapper {
    position: relative;
    width: 100%;
    margin-bottom: 1.25rem;
  }

  .input-icon {
    position: absolute;
    left: 1rem;
    top: 50%;
    transform: translateY(-50%);
    color: #64748b;
  }

  .password-input {
    width: 100%;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 0.875rem 1rem 0.875rem 2.75rem;
    box-sizing: border-box;
    color: #fff;
    font-family: inherit;
    font-size: 1rem;
    transition: all 0.2s;
  }

  .password-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .password-input.error {
    border-color: #ef4444;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
  }

  .footer-note {
    font-size: 0.75rem;
    color: #64748b;
    text-align: center;
  }

  /* Micro-animations */
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(15px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-fade-in {
    animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
