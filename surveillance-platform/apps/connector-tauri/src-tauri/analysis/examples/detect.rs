use std::path::Path;
fn main() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata");
    let det = surveillance_analysis::PersonDetector::load(&dir.join("yolox_nano.onnx")).unwrap();
    let img = image::open(dir.join("person.jpg")).unwrap();
    let t0 = std::time::Instant::now();
    let dets = det.detect(&img).unwrap();
    println!("inference: {:?}", t0.elapsed());
    for d in dets {
        println!("person conf={:.2} box=({:.2},{:.2})-({:.2},{:.2}) anchor=({:.2},{:.2})",
            d.confidence, d.bbox.x1, d.bbox.y1, d.bbox.x2, d.bbox.y2, d.bbox.anchor().x, d.bbox.anchor().y);
    }
}
