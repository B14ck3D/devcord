package fluxapi

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	PermReadMessages   int64 = 1 << 0
	PermSendMessages   int64 = 1 << 1
	PermManageChannels int64 = 1 << 2
	PermManageServer   int64 = 1 << 3
	PermAdministrator  int64 = 1 << 4
)

const permFull int64 = 9223372036854775807

func hasPerm(bitfield, want int64) bool {
	return bitfield&want == want
}

func (a *App) isServerMember(ctx context.Context, userID, serverID int64) (bool, error) {
	var n int
	err := a.pool.QueryRow(ctx,
		`SELECT 1 FROM server_members WHERE user_id = $1 AND server_id = $2`, userID, serverID).Scan(&n)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (a *App) memberPermBits(ctx context.Context, userID, serverID int64) (int64, error) {
	var bits int64
	err := a.pool.QueryRow(ctx, `
		SELECT r.permissions
		FROM member_roles mr
		JOIN roles r ON r.id = mr.role_id
		WHERE mr.user_id = $1 AND mr.server_id = $2
		ORDER BY r.position DESC
		LIMIT 1
	`, userID, serverID).Scan(&bits)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return permFull, nil
		}
		return 0, err
	}
	return bits, nil
}

func (a *App) channelServerID(ctx context.Context, pool *pgxpool.Pool, channelID int64) (int64, error) {
	var sid int64
	err := pool.QueryRow(ctx, `SELECT server_id FROM channels WHERE id = $1`, channelID).Scan(&sid)
	return sid, err
}

func (a *App) requireChannelPerm(ctx context.Context, uid, channelID int64, want int64) (serverID int64, ok bool, err error) {
	sid, err := a.channelServerID(ctx, a.pool, channelID)
	if err != nil {
		return 0, false, err
	}
	mem, err := a.isServerMember(ctx, uid, sid)
	if err != nil || !mem {
		return sid, false, err
	}
	p, err := a.memberPermBits(ctx, uid, sid)
	if err != nil {
		return sid, false, err
	}
	if hasPerm(p, PermAdministrator) || hasPerm(p, want) {
		return sid, true, nil
	}
	return sid, false, nil
}
