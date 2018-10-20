#ifndef _FUS_SYMTABLE_H_
#define _FUS_SYMTABLE_H_

#include "core.h"
#include "class.h"
#include "array.h"

#include <stdbool.h>


#define FUS_SYMTABLE_ENTRIES(TABLE) \
    ( (fus_symtable_entry_t*)(TABLE).entries.elems )


typedef struct fus_symtable_entry {
    struct fus_symtable *table;
    int token_len;
    char *token;
    bool is_name;
} fus_symtable_entry_t;

typedef struct fus_symtable {
    fus_core_t *core;
    fus_array_t entries;
    fus_class_t class_entry;
} fus_symtable_t;


void fus_symtable_entry_init_zero(fus_symtable_entry_t *entry);
void fus_symtable_entry_init(fus_symtable_entry_t *entry,
    fus_symtable_t *table, const char *token, int token_len);
void fus_symtable_entry_cleanup(fus_symtable_entry_t *entry);



void fus_symtable_init(fus_symtable_t *table, fus_core_t *core);
void fus_symtable_cleanup(fus_symtable_t *table);

int fus_symtable_len(fus_symtable_t *table);
fus_symtable_entry_t *fus_symtable_get_entry(fus_symtable_t *table,
    int sym_i);
const char *fus_symtable_get_token(fus_symtable_t *table, int sym_i);
int fus_symtable_add_from_token(fus_symtable_t *table,
    const char *token, int token_len);
int fus_symtable_get_from_token(fus_symtable_t *table,
    const char *token, int token_len);
int fus_symtable_get_or_add_from_token(fus_symtable_t *table,
    const char *token, int token_len);

int fus_symtable_add_from_string(fus_symtable_t *table, const char *string);
int fus_symtable_get_from_string(fus_symtable_t *table, const char *string);
int fus_symtable_get_or_add_from_string(fus_symtable_t *table, const char *string);



/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_init_symtable_entry(fus_class_t *class, void *ptr);
void fus_class_cleanup_symtable_entry(fus_class_t *class, void *ptr);


#endif