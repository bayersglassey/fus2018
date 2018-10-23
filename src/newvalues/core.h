#ifndef _FUS_CORE_H_
#define _FUS_CORE_H_

/* We wrap most of the standard C library to take an extra fus_core_t*
    argument.
    The resulting functions do *not* require (or even allow) caller to
    check for failure.
    Example:

        void *ptr = fus_malloc(core, 1024);
        // ptr is guaranteed not to be NULL

    The fus_core_t structure can be customized to do logging, custom
    error handling, etc. */



#include <stdlib.h>
#include <stdio.h>
#include <string.h>



typedef struct fus_core {
    /* Nothing in here yet, except a dummy field (since C doesn't
    allow empty structs).
    We could throw function pointers on here if we wanted the behaviour
    of logging, error handling, etc to be customizable at runtime...
    But for now, keepin it simple. */
    int dummy;
} fus_core_t;



void fus_core_init(fus_core_t *core);
void fus_core_cleanup(fus_core_t *core);

void fus_perror(fus_core_t *core, const char *msg);
void fus_exit(fus_core_t *core, int status);


void *fus_malloc(fus_core_t *core, size_t size);
void *fus_calloc(fus_core_t *core, size_t n, size_t size);
void *fus_realloc(fus_core_t *core, void *ptr, size_t size);
void fus_free(fus_core_t *core, void *ptr);

void *fus_memset(fus_core_t *core, void *ptr, int value, size_t n);
void *fus_memcpy(fus_core_t *core, void *ptr, void *srcptr, size_t n);
size_t fus_strlen(fus_core_t *core, const char *s);
size_t fus_strnlen(fus_core_t *core, const char *s, size_t maxlen);
char *fus_strdup(fus_core_t *core, const char *s1);
char *fus_strndup(fus_core_t *core, const char *s1, size_t len);

#endif