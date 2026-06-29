export default function DemoVideoPage() {
  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 20px" }}>
      <h1>Demo Video</h1>

      <video
        controls
        playsInline
        preload="metadata"
        style={{ width: "100%", borderRadius: "12px", marginTop: "20px" }}
      >
        <source
          src="https://krsbgejnviqyzytxaqaz.supabase.co/storage/v1/object/public/Video%20Demos/MMPRO_Demo.mp4"
          type="video/mp4"
        />
        Your browser does not support the video tag.
      </video>
    </main>
  );
}