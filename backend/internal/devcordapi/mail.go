package devcordapi

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"
)

const smtpDialTimeout = 15 * time.Second
const smtpSessionDeadline = 45 * time.Second

func (a *App) sendVerificationEmail(to, plainCode string) error {
	if strings.TrimSpace(a.cfg.SMTPHost) == "" || strings.TrimSpace(a.cfg.SMTPPassword) == "" {
		return fmt.Errorf("smtp not configured (SMTP_HOST / SMTP_PASSWORD)")
	}
	from := a.cfg.SMTPFrom
	host := strings.TrimSpace(a.cfg.SMTPHost)
	port := strings.TrimSpace(a.cfg.SMTPPort)
	if port == "" {
		port = "587"
	}
	addr := net.JoinHostPort(host, port)

	subject := "Devcord — weryfikacja konta"
	body := fmt.Sprintf("Twój kod weryfikacyjny: %s\r\nKod ważny 30 minut.\r\n", plainCode)
	hdr := "From: " + from + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=utf-8\r\n\r\n" +
		body

	d := net.Dialer{Timeout: smtpDialTimeout}
	conn, err := d.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("smtp dial %s: %w", addr, err)
	}
	deadline := time.Now().Add(smtpSessionDeadline)
	_ = conn.SetDeadline(deadline)
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer func() { _ = client.Close() }()

	if ok, _ := client.Extension("STARTTLS"); ok {
		tcfg := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
		if err := client.StartTLS(tcfg); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
		_ = conn.SetDeadline(time.Now().Add(smtpSessionDeadline))
	}

	auth := smtp.PlainAuth("", a.cfg.SMTPUser, a.cfg.SMTPPassword, host)
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("smtp auth: %w", err)
	}
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp mail: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write([]byte(hdr)); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp data close: %w", err)
	}
	if err := client.Quit(); err != nil {
		return fmt.Errorf("smtp quit: %w", err)
	}
	return nil
}
