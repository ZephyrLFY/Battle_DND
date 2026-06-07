#include "prebtl.h"
#include "ui_prebtl.h"
#include "wideuse.h"
#include "battleground.h"

preBtl::preBtl(QWidget *parent) :
    QDialog(parent),
    ui(new Ui::preBtl)
{
    ui->setupUi(this);
    connect(this,SIGNAL(getUsrPoke(QList<QString>&)),udpthread,SLOT(initUser(QList<QString>&)));
    connect(udpthread,SIGNAL(userGet(QList<QString>&)),this,SLOT(myTable(QList<QString>&)));
    connect(this,SIGNAL(getEnmPoke(QList<QString> &)),udpthread,SLOT(getPoke(QList<QString>&)));
    connect(udpthread,SIGNAL(allpoke(QList<QString>&)),this,SLOT(enmTable(QList<QString>&)));
    getMy();
    getEnm();
    connect(ui->myPoke->selectionModel(),SIGNAL(selectionChanged(const QItemSelection&,const QItemSelection&)),
            this,SLOT(getMyPoke(const QItemSelection&,const QItemSelection&)));
    connect(ui->enmPoke->selectionModel(),SIGNAL(selectionChanged(const QItemSelection&,const QItemSelection&)),
            this,SLOT(getEnmPoke(const QItemSelection&,const QItemSelection&)));
}

preBtl::~preBtl()
{
    disconnect(this,SIGNAL(getUsrPoke(QList<QString>&)),udpthread,SLOT(initUser(QList<QString>&)));
    disconnect(udpthread,SIGNAL(userGet(QList<QString>&)),this,SLOT(myTable(QList<QString>&)));
    disconnect(this,SIGNAL(getEnmPoke(QList<QString> &)),udpthread,SLOT(getPoke(QList<QString>&)));
    disconnect(udpthread,SIGNAL(allpoke(QList<QString>&)),this,SLOT(enmTable(QList<QString>&)));
    disconnect(ui->myPoke->selectionModel(),SIGNAL(selectionChanged(const QItemSelection&,const QItemSelection&)),
            this,SLOT(getMyPoke(const QItemSelection&,const QItemSelection&)));
    disconnect(ui->enmPoke->selectionModel(),SIGNAL(selectionChanged(const QItemSelection&,const QItemSelection&)),
            this,SLOT(getEnmPoke(const QItemSelection&,const QItemSelection&)));
    myPokeModel->clear();
    delete myPokeModel;
    enmPokeModel->clear();
    delete enmPokeModel;
    delete ui;
}

void preBtl::getMy()
{
    QList<QString> text;
    text << "7" << localUser->getName();
    emit getUsrPoke(text);
}

void preBtl::getEnm()
{
    QList<QString> text;
    text << "6" << localUser->getName();
    emit getEnmPoke(text);
}

void preBtl::getMyPoke(const QItemSelection&,const QItemSelection&)
{
    which = ui->myPoke->currentIndex().row();
    myChosen = 1;
}

void preBtl::getEnmPoke(const QItemSelection&,const QItemSelection&)
{
    enmChose = new QList<QString>;
    qint32 row= ui->enmPoke->currentIndex().row();
    QModelIndex index = enmPokeModel->index(row,0);
    enmChose->append(enmPokeModel->data(index).toString());
    index = enmPokeModel->index(row,1);
    enmChose->append(enmPokeModel->data(index).toString());
    enmChose->append("0");
    enmChosen = 1;
}

void preBtl::myTable(QList<QString> &poke)
{
    poke.removeFirst();
    poke.removeFirst();
    qint32 i = 0;
    rowNum1 = poke.count("line");
    myPokeModel = new QStandardItemModel(this);
    myPokeModel->setColumnCount(3);
    myPokeModel->setRowCount(rowNum1);
    myPokeModel->setHeaderData(0,Qt::Horizontal,"精灵名");
    myPokeModel->setHeaderData(1,Qt::Horizontal,"等级");
    myPokeModel->setHeaderData(2,Qt::Horizontal,"经验");
    for(qint32 row = 0; row < rowNum1; row++)
    {
        for(qint32 col = 0; col < 3; col++)
        {
            if(poke.at(i) == "line")
                i++;
            QStandardItem *item = new QStandardItem(poke.at(i));
            myPokeModel->setItem(row,col,item);
            i++;
        }
    }
    ui->myPoke->setModel(myPokeModel);
    ui->myPoke->setEditTriggers(QAbstractItemView::NoEditTriggers);
    ui->myPoke->verticalHeader()->setVisible(false);
    ui->myPoke->resizeColumnsToContents();
    ui->myPoke->setSelectionMode(QAbstractItemView::SingleSelection);
    ui->myPoke->setSelectionBehavior(QAbstractItemView::SelectRows);
}

void preBtl::enmTable(QList<QString> &poke)
{

    qint32 i = 0;
    rowNum2 = poke.count("line");
    enmPokeModel = new QStandardItemModel(this);
    enmPokeModel->setColumnCount(2);
    enmPokeModel->setRowCount(rowNum2);
    enmPokeModel->setHeaderData(0,Qt::Horizontal,"精灵名");
    enmPokeModel->setHeaderData(1,Qt::Horizontal,"等级");
    for(qint32 row = 0; row < rowNum2; row++)
    {
        for(qint32 col = 0; col < 2; col++)
        {
            if(poke.at(i) == "line")
                i++;
            QStandardItem *item = new QStandardItem(poke.at(i));
            enmPokeModel->setItem(row,col,item);
            i++;
        }
    }
    ui->enmPoke->setModel(enmPokeModel);
    ui->enmPoke->setEditTriggers(QAbstractItemView::NoEditTriggers);
    ui->enmPoke->verticalHeader()->setVisible(false);
    ui->enmPoke->resizeColumnsToContents();
    ui->enmPoke->setSelectionMode(QAbstractItemView::SingleSelection);
    ui->enmPoke->setSelectionBehavior(QAbstractItemView::SelectRows);
}

void preBtl::on_buttonBox_accepted()
{
    if(!myChosen)
            QMessageBox::warning(this, tr("警告！"),tr("请选择您的精灵"),QMessageBox::Yes);
    else if(!enmChosen)
            QMessageBox::warning(this, tr("警告！"),tr("请选择要对战的精灵"),QMessageBox::Yes);
    else
    {
        localUser->choseToBattle(which);
        localUser->createEnm(*enmChose);
        accept();
    }
}

void preBtl::on_buttonBox_rejected()
{
    reject();
}
