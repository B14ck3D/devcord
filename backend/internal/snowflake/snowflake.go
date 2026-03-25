package snowflake

import (
	"errors"
	"strconv"
	"sync"
	"time"
)

const (
	TypeServer       int64 = 1
	TypeVoiceChannel int64 = 2
	TypeTextChannel  int64 = 3
	TypeUser         int64 = 4
	TypeCategory     int64 = 5
	TypeRole         int64 = 6
	TypeMessage      int64 = 7
	TypeTask         int64 = 8
	TypeInvite       int64 = 9
)

const (
	customEpochMs int64 = 1577836800000
	typeShift     = 60
	timeShift     = 19
	seqMask       = (1 << 19) - 1
)

type Generator struct {
	mu     sync.Mutex
	lastMs int64
	seq    int64
}

func NewGenerator() *Generator {
	return &Generator{}
}

func (g *Generator) Next(entityType int64) (id int64, err error) {
	if entityType < 1 || entityType > 15 {
		return 0, errors.New("snowflake: entity type out of range")
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	ms := time.Now().UnixMilli() - customEpochMs
	if ms < 0 {
		ms = 0
	}
	if ms < g.lastMs {
		ms = g.lastMs
	}
	if ms == g.lastMs {
		g.seq++
		if g.seq > seqMask {
			return 0, errors.New("snowflake: sequence overflow")
		}
	} else {
		g.lastMs = ms
		g.seq = 0
	}
	id = (entityType << typeShift) | (ms << timeShift) | g.seq
	return id, nil
}

func EntityType(id int64) int64 {
	return id >> typeShift
}

func Format(id int64) string {
	return strconv.FormatInt(id, 10)
}
