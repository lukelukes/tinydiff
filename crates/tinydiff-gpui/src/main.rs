use gpui::{
    App, Application, Bounds, Context, SharedString, Window, WindowBounds, WindowOptions, div,
    prelude::*, px, rgb, size,
};

struct TinyDiff {
    title: SharedString,
}

impl Render for TinyDiff {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .bg(rgb(0x1e1e2e))
            .size_full()
            .justify_center()
            .items_center()
            .text_xl()
            .text_color(rgb(0xcdd6f4))
            .child(format!("{}", &self.title))
    }
}

fn main() {
    Application::new().run(|cx: &mut App| {
        let bounds = Bounds::centered(None, size(px(800.), px(600.)), cx);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                ..Default::default()
            },
            |_, cx| {
                cx.new(|_| TinyDiff {
                    title: "TinyDiff".into(),
                })
            },
        )
        .expect("failed to open main window");
    });
}
