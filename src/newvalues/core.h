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

void fus_core_init(fus_core_t *core){
    /* Ok */
}

void fus_core_cleanup(fus_core_t *core){
    /* Ok */
}



void fus_perror(fus_core_t *core, const char *msg){
    fprintf(stderr, "fus_perror: ");
    perror(msg);
}

void fus_exit(fus_core_t *core, int status){
    fprintf(stderr, "fus_exit: status=%i\n", status);
    exit(status);
}


void *fus_malloc(fus_core_t *core, size_t size){
    void *ptr = malloc(size);
    if(ptr == NULL){
        fus_perror(core, "fus_malloc");
        fus_exit(core, EXIT_FAILURE);
    }
    return ptr;
}

void *fus_calloc(fus_core_t *core, size_t n, size_t size){
    void *ptr = calloc(n, size);
    if(ptr == NULL){
        fus_perror(core, "fus_calloc");
        fus_exit(core, EXIT_FAILURE);
    }
    return ptr;
}

void *fus_realloc(fus_core_t *core, void *ptr, size_t size){
    void *new_ptr = realloc(ptr, size);
    if(new_ptr == NULL){
        fus_perror(core, "fus_realloc");
        fus_exit(core, EXIT_FAILURE);
    }
    return new_ptr;
}

void fus_free(fus_core_t *core, void *ptr){
    free(ptr);
}

void *fus_memset(fus_core_t *core, void *ptr, int value, size_t n){
    void *new_ptr = memset(ptr, value, n);
    if(new_ptr == NULL){
        fus_perror(core, "fus_memset");
        fus_exit(core, EXIT_FAILURE);
    }
    return new_ptr;
}


#endif