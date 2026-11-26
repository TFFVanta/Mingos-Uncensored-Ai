"""Windows stand-in for the Unix-only `pwd` module, for Local Chat's SearXNG.

SearXNG imports pwd in searx/valkeydb.py but only calls it when a Valkey cache
database fails to connect, and Local Chat doesn't configure one.
"""
import getpass
from collections import namedtuple

struct_passwd = namedtuple("struct_passwd", "pw_name pw_passwd pw_uid pw_gid pw_gecos pw_dir pw_shell")


def getpwuid(uid=0):
    return struct_passwd(getpass.getuser(), "x", uid, 0, "", "", "")
