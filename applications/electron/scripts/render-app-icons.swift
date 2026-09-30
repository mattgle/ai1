import AppKit

let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let size = 1024
let face = NSRect(x: 100, y: 100, width: 824, height: 824)

for theme in ["dark", "light"] {
    let source = directory.appendingPathComponent("logo-\(theme).png")
    guard let image = NSImage(contentsOf: source),
          let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: size,
            pixelsHigh: size,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
          ),
          let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        fatalError("Cannot render \(source.path)")
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    context.cgContext.clear(CGRect(x: 0, y: 0, width: size, height: size))
    let outline = NSBezierPath(roundedRect: face, xRadius: 184, yRadius: 184)

    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.24)
    shadow.shadowBlurRadius = 18
    shadow.shadowOffset = NSSize(width: 0, height: -10)
    shadow.set()
    NSColor.black.setFill()
    outline.fill()
    NSGraphicsContext.restoreGraphicsState()

    NSGraphicsContext.saveGraphicsState()
    outline.addClip()
    image.draw(in: face, from: .zero, operation: .sourceOver, fraction: 1)
    let edge = NSBezierPath(roundedRect: face.insetBy(dx: 1, dy: 1), xRadius: 183, yRadius: 183)
    NSColor(white: theme == "dark" ? 1 : 0, alpha: 0.16).setStroke()
    edge.lineWidth = 2
    edge.stroke()
    NSGraphicsContext.restoreGraphicsState()
    NSGraphicsContext.restoreGraphicsState()

    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Cannot encode the \(theme) icon")
    }
    try png.write(to: directory.appendingPathComponent("icon-\(theme).png"), options: .atomic)
}
